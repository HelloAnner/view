import type { Server } from 'bun';
import fs from 'node:fs';
import path from 'node:path';
import type { PreviewOptions, TreeNode } from './types.ts';
import {
  classifyFile,
  classifyFileName,
  getContentType,
} from './file-types.ts';
import { renderPreview } from './providers/registry.ts';
import template from './assets/app.html' with { type: 'text' };
import appStyles from './assets/app.css' with { type: 'text' };
import appScript from './assets/app.js' with { type: 'text' };
import providerRegistry from './assets/providers/registry.js' with { type: 'text' };
import markdownViewProvider from './assets/providers/markdown.js' with { type: 'text' };
import codeViewProvider from './assets/providers/code.js' with { type: 'text' };
import imageViewProvider from './assets/providers/image.js' with { type: 'text' };
import pdfViewProvider from './assets/providers/pdf.js' with { type: 'text' };
import htmlViewProvider from './assets/providers/html.js' with { type: 'text' };
import binaryViewProvider from './assets/providers/binary.js' with { type: 'text' };

const appProviders = [
  providerRegistry,
  markdownViewProvider,
  codeViewProvider,
  imageViewProvider,
  pdfViewProvider,
  htmlViewProvider,
  binaryViewProvider,
].join('\n');

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  'dist',
  'coverage',
]);

function resolveSafePath(root: string, raw: string): string {
  const target = path.resolve(root, path.normalize(raw));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Access denied');
  }
  return target;
}

function shouldIgnoreName(name: string): boolean {
  return IGNORED_NAMES.has(name) || name.startsWith('.');
}

function buildDirectoryNode(root: string, current: string): TreeNode {
  const stat = fs.statSync(current);
  const relative = path.relative(root, current) || '.';

  if (!stat.isDirectory()) {
    throw new Error('Not a directory');
  }

  return {
    name: path.basename(current),
    path: relative,
    type: 'directory',
    children: listDirectory(root, current),
    hasChildren: true,
    loaded: true,
  };
}

function listDirectory(root: string, current: string): TreeNode[] {
  const children: TreeNode[] = [];

  for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
    if (shouldIgnoreName(dirent.name)) continue;

    const absolute = path.join(current, dirent.name);
    const relative = path.relative(root, absolute) || '.';

    if (dirent.isDirectory()) {
      children.push({
        name: dirent.name,
        path: relative,
        type: 'directory',
        hasChildren: true,
        loaded: false,
      });
      continue;
    }

    if (dirent.isFile()) {
      children.push({
        name: dirent.name,
        path: relative,
        type: 'file',
        previewType: classifyFileName(absolute).type,
      });
    }
  }

  return children.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

function searchFiles(root: string, query: string, limit = 200): {
  results: TreeNode[];
  truncated: boolean;
} {
  const normalizedQuery = query.trim().toLowerCase();
  const results: TreeNode[] = [];
  let truncated = false;

  function walk(current: string) {
    if (results.length >= limit) {
      truncated = true;
      return;
    }

    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    dirents.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory()) return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    });

    for (const dirent of dirents) {
      if (shouldIgnoreName(dirent.name)) continue;
      if (results.length >= limit) {
        truncated = true;
        return;
      }

      const absolute = path.join(current, dirent.name);
      const relative = path.relative(root, absolute);

      if (dirent.isDirectory()) {
        walk(absolute);
        continue;
      }

      if (!dirent.isFile()) continue;

      if (
        dirent.name.toLowerCase().includes(normalizedQuery) ||
        relative.toLowerCase().includes(normalizedQuery)
      ) {
        results.push({
          name: dirent.name,
          path: relative,
          type: 'file',
          previewType: classifyFileName(absolute).type,
        });
      }
    }
  }

  if (normalizedQuery) walk(root);

  return { results, truncated };
}

function fileVersion(stat: fs.Stats): string {
  return `${stat.mtimeMs.toFixed(3)}:${stat.size}`;
}

function guessInitialFile(root: string): string | null {
  const candidates = ['README.md', 'readme.md', 'Readme.md', 'index.md'];
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

const MAX_SERVER_LIFETIME_MS = 12 * 60 * 60 * 1000;
const TAB_PING_TIMEOUT_MS = 60 * 1000;
const TAB_CHECK_INTERVAL_MS = 10 * 1000;

export async function startServer(options: PreviewOptions): Promise<{
  server: Server<unknown>;
  url: string;
}> {
  const initialFile = options.initialFile
    ? path.resolve(options.root, options.initialFile)
    : guessInitialFile(options.root);

  const tabs = new Map<string, number>();
  let hasHadTab = false;
  let server: Server<unknown>;
  let idleShutdownTimer: ReturnType<typeof setTimeout> | null = null;
  let shutdownStarted = false;

  function shutdownServer() {
    if (shutdownStarted) return;
    shutdownStarted = true;
    clearTimeout(lifetimeTimer);
    clearInterval(checkTimer);
    if (idleShutdownTimer) clearTimeout(idleShutdownTimer);
    try {
      server.stop();
    } catch {
      // ignore
    }
    process.exit(0);
  }

  function scheduleIdleShutdown(delayMs = 750) {
    if (!hasHadTab || tabs.size > 0 || idleShutdownTimer) return;
    idleShutdownTimer = setTimeout(() => {
      idleShutdownTimer = null;
      if (hasHadTab && tabs.size === 0) shutdownServer();
    }, delayMs);
  }

  function cancelIdleShutdown() {
    if (!idleShutdownTimer) return;
    clearTimeout(idleShutdownTimer);
    idleShutdownTimer = null;
  }

  const lifetimeTimer = setTimeout(() => {
    console.log('Maximum server lifetime reached (12h), shutting down.');
    shutdownServer();
  }, MAX_SERVER_LIFETIME_MS);

  const checkTimer = setInterval(() => {
    const now = Date.now();
    for (const [tabId, lastPing] of tabs) {
      if (now - lastPing > TAB_PING_TIMEOUT_MS) {
        tabs.delete(tabId);
      }
    }
    if (hasHadTab && tabs.size === 0) {
      scheduleIdleShutdown();
    }
  }, TAB_CHECK_INTERVAL_MS);

  async function readJsonBody(req: Request): Promise<Record<string, unknown> | null> {
    try {
      const text = await req.text();
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  server = Bun.serve({
    port: options.port,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      const noCache = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

      try {
        if (pathname === '/') {
          const html = (template as unknown as string)
            .replace('{{APP_CSS}}', appStyles as unknown as string)
            .replace('{{APP_PROVIDERS}}', appProviders as unknown as string)
            .replace('{{APP_SCRIPT}}', appScript as unknown as string)
            .replace('{{APP_CONTEXT}}', JSON.stringify({
              rootName: path.basename(options.root),
              rootPath: options.root,
              launchMode: options.launchMode,
              initialFile: initialFile ? path.relative(options.root, initialFile) : null,
            }));
          return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8', ...noCache },
          });
        }

        if (pathname === '/favicon.ico') {
          return new Response(null, { status: 204, headers: noCache });
        }

        if (pathname === '/api/tree') {
          const raw = url.searchParams.get('path') || '.';
          const target = resolveSafePath(options.root, raw);
          const stat = fs.statSync(target);
          if (!stat.isDirectory()) {
            return new Response('Not a directory', { status: 400, headers: noCache });
          }
          return Response.json(buildDirectoryNode(options.root, target), { headers: noCache });
        }

        if (pathname === '/api/search') {
          const query = url.searchParams.get('q') || '';
          return Response.json(searchFiles(options.root, query), { headers: noCache });
        }

        if (pathname.startsWith('/files/')) {
          const raw = decodeURIComponent(pathname.slice('/files/'.length));
          if (!raw) return new Response('Missing path', { status: 400, headers: noCache });
          const target = resolveSafePath(options.root, raw);
          const stat = fs.statSync(target);
          if (!stat.isFile()) return new Response('Not a file', { status: 400, headers: noCache });
          const file = Bun.file(target);
          return new Response(file, {
            headers: { 'Content-Type': getContentType(target), ...noCache },
          });
        }

        if (pathname.startsWith('/preview-html/')) {
          const raw = decodeURIComponent(pathname.slice('/preview-html/'.length));
          if (!raw) return new Response('Missing path', { status: 400, headers: noCache });
          const target = resolveSafePath(options.root, raw);
          const stat = fs.statSync(target);
          if (!stat.isFile()) return new Response('Not a file', { status: 400, headers: noCache });
          const contentType = getContentType(target);
          const headers: Record<string, string> = {
            'Content-Type': contentType,
            'X-Content-Type-Options': 'nosniff',
            ...noCache,
          };
          if (contentType.startsWith('text/html')) {
            headers['Content-Security-Policy'] = [
              'sandbox allow-scripts allow-forms allow-popups',
              "default-src 'self' data: blob: https: http:",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https: http:",
              "style-src 'self' 'unsafe-inline' data: blob: https: http:",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data: blob: https: http:",
              "connect-src 'self' https: http: ws: wss:",
              "object-src 'none'",
              "base-uri 'none'",
            ].join('; ');
          }
          return new Response(Bun.file(target), { headers });
        }

        if (pathname === '/api/open' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const tabId = body && typeof body.tabId === 'string' ? body.tabId : null;
          if (tabId) {
            tabs.set(tabId, Date.now());
            hasHadTab = true;
            cancelIdleShutdown();
          }
          return new Response('ok', { headers: noCache });
        }

        if (pathname === '/api/ping' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const tabId = body && typeof body.tabId === 'string' ? body.tabId : null;
          if (tabId) {
            tabs.set(tabId, Date.now());
            cancelIdleShutdown();
          }
          return new Response('ok', { headers: noCache });
        }

        if (pathname === '/api/close' && req.method === 'POST') {
          const body = await readJsonBody(req);
          const tabId = body && typeof body.tabId === 'string' ? body.tabId : null;
          if (tabId) tabs.delete(tabId);
          scheduleIdleShutdown();
          return new Response('ok', { headers: noCache });
        }

        if (pathname === '/api/file') {
          const raw = url.searchParams.get('path');
          if (!raw) return new Response('Missing path', { status: 400, headers: noCache });
          const target = resolveSafePath(options.root, raw);
          const stat = fs.statSync(target);
          if (!stat.isFile()) return new Response('Not a file', { status: 400, headers: noCache });
          const file = Bun.file(target);
          return new Response(file, {
            headers: { 'Content-Type': getContentType(target), ...noCache },
          });
        }

        if (pathname === '/api/preview') {
          const raw = url.searchParams.get('path');
          if (!raw) return new Response('Missing path', { status: 400, headers: noCache });
          const target = resolveSafePath(options.root, raw);
          const stat = fs.statSync(target);
          if (!stat.isFile()) return new Response('Not a file', { status: 400, headers: noCache });

          const relativePath = path.relative(options.root, target);
          const version = fileVersion(stat);
          const requestedVersion = url.searchParams.get('version');
          if (requestedVersion === version) {
            return new Response(null, { status: 304, headers: noCache });
          }

          const classification = await classifyFile(target, stat.size);
          const requestedView = url.searchParams.get('view') === 'source' ? 'source' : 'preview';
          const preview = await renderPreview({
            target,
            relativePath,
            stat,
            classification,
            requestedView,
            version,
          });
          return Response.json(preview, { headers: noCache });
        }

        return new Response('Not found', { status: 404, headers: noCache });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return new Response(message, { status: 500, headers: noCache });
      }
    },
  });

  return {
    server,
    url: `http://${server.hostname}:${server.port}`,
  };
}

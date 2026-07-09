import type { Server } from 'bun';
import fs from 'node:fs';
import path from 'node:path';
import hljs from 'highlight.js';
import type { PreviewOptions, TreeNode } from './types.ts';
import { renderMarkdown } from './markdown.ts';
import template from './assets/app.html' with { type: 'text' };

const IGNORED_NAMES = new Set([
  '.git',
  'node_modules',
  '.DS_Store',
  'dist',
  'coverage',
]);

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.avif',
]);

const CODE_EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.html': 'html',
  '.xml': 'xml',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.php': 'php',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.vue': 'xml',
  '.svelte': 'xml',
  '.dart': 'dart',
  '.lua': 'lua',
  '.r': 'r',
  '.pl': 'perl',
  '.perl': 'perl',
  '.dockerfile': 'dockerfile',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.makefile': 'makefile',
  '.mk': 'makefile',
};

function isMarkdown(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isImage(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function isPdf(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

function isCode(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() in CODE_EXTENSION_MAP;
}

function resolveSafePath(root: string, raw: string): string {
  const target = path.resolve(root, path.normalize(raw));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Access denied');
  }
  return target;
}

function buildTree(root: string, current: string): TreeNode {
  const stat = fs.statSync(current);
  const relative = path.relative(root, current) || '.';

  if (stat.isDirectory()) {
    const children: TreeNode[] = fs
      .readdirSync(current)
      .filter((name) => !IGNORED_NAMES.has(name) && !name.startsWith('.'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => buildTree(root, path.join(current, name)))
      .sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'directory' ? -1 : 1;
      });

    return {
      name: path.basename(current),
      path: relative,
      type: 'directory',
      children,
    };
  }

  return {
    name: path.basename(current),
    path: relative,
    type: 'file',
  };
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
    '.avif': 'image/avif',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.txt': 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function guessInitialFile(root: string): string | null {
  const candidates = ['README.md', 'readme.md', 'Readme.md', 'index.md'];
  for (const name of candidates) {
    const p = path.join(root, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export async function startServer(options: PreviewOptions): Promise<{
  server: Server;
  url: string;
}> {
  const initialFile = guessInitialFile(options.root);
  const tree = buildTree(options.root, options.root);

  const server = Bun.serve({
    port: options.port,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      const noCache = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

      try {
        if (pathname === '/') {
          const html = template
            .replace('{{ROOT}}', JSON.stringify(options.root))
            .replace(
              '{{INITIAL_FILE}}',
              JSON.stringify(initialFile ? path.relative(options.root, initialFile) : null)
            );
          return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=utf-8', ...noCache },
          });
        }

        if (pathname === '/favicon.ico') {
          return new Response(null, { status: 204, headers: noCache });
        }

        if (pathname === '/api/tree') {
          return Response.json(tree, { headers: noCache });
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

        if (pathname === '/api/render') {
          const raw = url.searchParams.get('path');
          if (!raw) return new Response('Missing path', { status: 400, headers: noCache });
          const target = resolveSafePath(options.root, raw);
          const stat = fs.statSync(target);
          if (!stat.isFile()) return new Response('Not a file', { status: 400, headers: noCache });

          if (!isMarkdown(target)) {
            return new Response('Not a Markdown file', { status: 400, headers: noCache });
          }

          const content = await fs.promises.readFile(target, 'utf-8');
          const relativeTarget = path.relative(options.root, target);
          const result = renderMarkdown(content, relativeTarget);
          return Response.json(result, { headers: noCache });
        }

        if (pathname === '/api/preview') {
          const raw = url.searchParams.get('path');
          if (!raw) return new Response('Missing path', { status: 400, headers: noCache });
          const target = resolveSafePath(options.root, raw);
          const stat = fs.statSync(target);
          if (!stat.isFile()) return new Response('Not a file', { status: 400, headers: noCache });

          const relativePath = path.relative(options.root, target);
          const fileUrl = `/api/file?path=${encodeURIComponent(relativePath)}`;

          if (isImage(target)) {
            return Response.json(
              { type: 'image', url: fileUrl, title: path.basename(target), size: stat.size },
              { headers: noCache }
            );
          }

          if (isPdf(target)) {
            return Response.json(
              { type: 'pdf', url: fileUrl, title: path.basename(target), size: stat.size },
              { headers: noCache }
            );
          }

          if (isCode(target)) {
            const content = await fs.promises.readFile(target, 'utf-8');
            const ext = path.extname(target).toLowerCase();
            const language = CODE_EXTENSION_MAP[ext] || 'plaintext';
            const highlighted = hljs.getLanguage(language)
              ? hljs.highlight(content, { language }).value
              : hljs.highlightAuto(content).value;
            return Response.json(
              { type: 'code', html: highlighted, language, title: path.basename(target), size: stat.size },
              { headers: noCache }
            );
          }

          return Response.json(
            {
              type: 'binary',
              title: path.basename(target),
              mime: getContentType(target),
              size: stat.size,
              readableSize: formatBytes(stat.size),
              url: fileUrl,
            },
            { headers: noCache }
          );
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

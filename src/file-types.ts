import fs from 'node:fs';
import path from 'node:path';
import type { PreviewType } from './types.ts';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.avif',
]);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);

const SPECIAL_FILENAME_LANGUAGE: Record<string, string> = {
  'dockerfile': 'dockerfile',
  'containerfile': 'dockerfile',
  'makefile': 'makefile',
  'gnumakefile': 'makefile',
  '.bashrc': 'bash',
  '.bash_profile': 'bash',
  '.zshrc': 'bash',
  '.zprofile': 'bash',
  '.profile': 'bash',
  '.gitignore': 'plaintext',
  '.gitattributes': 'plaintext',
  '.editorconfig': 'ini',
  'bun.lock': 'toml',
  'yarn.lock': 'yaml',
  'gemfile': 'ruby',
  'rakefile': 'ruby',
};

const CODE_EXTENSION_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx',
  '.mjs': 'javascript', '.cjs': 'javascript', '.json': 'json', '.jsonc': 'json',
  '.html': 'html', '.htm': 'html', '.xml': 'xml', '.svg': 'xml', '.css': 'css',
  '.scss': 'scss', '.sass': 'sass', '.less': 'less', '.py': 'python',
  '.java': 'java', '.c': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.h': 'c',
  '.hpp': 'cpp', '.rs': 'rust', '.go': 'go', '.rb': 'ruby', '.php': 'php',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'zsh', '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml', '.sql': 'sql', '.swift': 'swift', '.kt': 'kotlin',
  '.kts': 'kotlin', '.vue': 'xml', '.svelte': 'xml', '.dart': 'dart',
  '.lua': 'lua', '.r': 'r', '.pl': 'perl', '.perl': 'perl',
  '.dockerfile': 'dockerfile', '.ini': 'ini', '.cfg': 'ini', '.conf': 'ini',
  '.makefile': 'makefile', '.mk': 'makefile', '.txt': 'plaintext',
  '.text': 'plaintext', '.log': 'plaintext', '.lock': 'plaintext',
  '.csv': 'plaintext', '.tsv': 'plaintext', '.diff': 'diff', '.patch': 'diff',
  '.graphql': 'graphql', '.gql': 'graphql', '.proto': 'protobuf',
  '.md': 'markdown', '.markdown': 'markdown', '.mdx': 'markdown',
};

export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
export const MAX_TEXT_PREVIEW_LINES = 50_000;

export interface FileClassification {
  type: PreviewType;
  language?: string;
}

export interface TextPreview {
  content: string;
  lineCount: number;
  truncated: boolean;
}

export function languageForFile(filePath: string): string | null {
  const name = path.basename(filePath).toLowerCase();
  if (SPECIAL_FILENAME_LANGUAGE[name]) return SPECIAL_FILENAME_LANGUAGE[name];
  if (name === '.env' || name.startsWith('.env.')) return 'bash';
  return CODE_EXTENSION_MAP[path.extname(name).toLowerCase()] || null;
}

export function classifyFileName(filePath: string): FileClassification {
  const ext = path.extname(filePath).toLowerCase();
  if (MARKDOWN_EXTENSIONS.has(ext)) return { type: 'markdown' };
  if (IMAGE_EXTENSIONS.has(ext)) return { type: 'image' };
  if (ext === '.pdf') return { type: 'pdf' };
  if (HTML_EXTENSIONS.has(ext)) return { type: 'html' };
  const language = languageForFile(filePath);
  if (language) return { type: 'code', language };
  return { type: 'binary' };
}

async function looksLikeText(filePath: string, size: number): Promise<boolean> {
  if (size === 0) return true;
  const sampleSize = Math.min(size, 8192);
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(sampleSize);
    const { bytesRead } = await handle.read(buffer, 0, sampleSize, 0);
    let suspicious = 0;
    for (let i = 0; i < bytesRead; i++) {
      const byte = buffer[i];
      if (byte === 0) return false;
      if (byte < 7 || (byte > 13 && byte < 32)) suspicious++;
    }
    return suspicious / Math.max(bytesRead, 1) < 0.03;
  } finally {
    await handle.close();
  }
}

export async function classifyFile(filePath: string, size: number): Promise<FileClassification> {
  const named = classifyFileName(filePath);
  if (named.type !== 'binary') return named;
  if (await looksLikeText(filePath, size)) return { type: 'code', language: 'plaintext' };
  return named;
}

export async function readTextPreview(filePath: string, size: number): Promise<TextPreview> {
  const bytesToRead = Math.min(size, MAX_TEXT_PREVIEW_BYTES + 4);
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    let content = buffer.subarray(0, Math.min(bytesRead, MAX_TEXT_PREVIEW_BYTES)).toString('utf-8');
    let truncated = size > MAX_TEXT_PREVIEW_BYTES;
    const lines = content.split(/\r\n|\r|\n/);
    if (lines.length > MAX_TEXT_PREVIEW_LINES) {
      content = lines.slice(0, MAX_TEXT_PREVIEW_LINES).join('\n');
      truncated = true;
    }
    return {
      content,
      lineCount: content.length === 0 ? 1 : content.split(/\r\n|\r|\n/).length,
      truncated,
    };
  } finally {
    await handle.close();
  }
}

export function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
    '.pdf': 'application/pdf', '.json': 'application/json; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
  };
  return map[ext] || 'application/octet-stream';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

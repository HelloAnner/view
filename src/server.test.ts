import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  classifyFile,
  classifyFileName,
  MAX_TEXT_PREVIEW_LINES,
  readTextPreview,
  supportsSourceView,
} from './file-types.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true })
    )
  );
});

describe('file classification', () => {
  test('recognizes viewer modes and special code filenames', () => {
    expect(classifyFileName('README.md')).toEqual({ type: 'markdown' });
    expect(classifyFileName('photo.webp')).toEqual({ type: 'image' });
    expect(classifyFileName('manual.pdf')).toEqual({ type: 'pdf' });
    expect(classifyFileName('index.html')).toEqual({ type: 'html' });
    expect(classifyFileName('Makefile')).toEqual({ type: 'code', language: 'makefile' });
    expect(classifyFileName('Dockerfile')).toEqual({ type: 'code', language: 'dockerfile' });
    expect(classifyFileName('bun.lock')).toEqual({ type: 'code', language: 'toml' });
    expect(classifyFileName('.env.local')).toEqual({ type: 'code', language: 'bash' });
    expect(supportsSourceView('diagram.svg', classifyFileName('diagram.svg'))).toBe(true);
    expect(supportsSourceView('photo.webp', classifyFileName('photo.webp'))).toBe(false);
  });

  test('treats unknown readable files as plaintext and preserves binary files', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'view-classify-'));
    temporaryDirectories.push(directory);

    const readable = path.join(directory, 'NOTICE');
    const binary = path.join(directory, 'archive.data');
    await fs.promises.writeFile(readable, 'A readable file without an extension.\n');
    await fs.promises.writeFile(binary, Buffer.from([0, 1, 2, 3, 255]));

    expect(await classifyFile(readable, (await fs.promises.stat(readable)).size)).toEqual({
      type: 'code',
      language: 'plaintext',
    });
    expect(await classifyFile(binary, (await fs.promises.stat(binary)).size)).toEqual({
      type: 'binary',
    });
  });

  test('truncates text previews at the configured line limit', async () => {
    const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'view-lines-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'many-lines.txt');
    await fs.promises.writeFile(file, `${'line\n'.repeat(MAX_TEXT_PREVIEW_LINES + 10)}tail`);

    const preview = await readTextPreview(file, (await fs.promises.stat(file)).size);
    expect(preview.truncated).toBe(true);
    expect(preview.lineCount).toBe(MAX_TEXT_PREVIEW_LINES);
  });
});

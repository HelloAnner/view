import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyFile, MAX_TEXT_PREVIEW_LINES } from '../file-types.ts';
import { renderPreview, resolvePreviewProvider } from './registry.ts';
import type { PreviewContext, PreviewView } from './types.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true })
    )
  );
});

async function createContext(
  name: string,
  content: string | Buffer,
  requestedView: PreviewView = 'preview'
): Promise<PreviewContext> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'view-provider-'));
  temporaryDirectories.push(directory);
  const target = path.join(directory, name);
  await fs.promises.writeFile(target, content);
  const stat = await fs.promises.stat(target);
  return {
    target,
    relativePath: name,
    stat,
    classification: await classifyFile(target, stat.size),
    requestedView,
    version: `${stat.mtimeMs.toFixed(3)}:${stat.size}`,
  };
}

describe('preview provider registry', () => {
  test('routes markdown preview and source through the markdown provider', async () => {
    const previewContext = await createContext('README.md', '# Provider title\n\nHello.');
    expect(resolvePreviewProvider(previewContext).id).toBe('markdown');

    const preview = await renderPreview(previewContext);
    expect(preview.type).toBe('markdown');
    expect(preview.view).toBe('preview');
    expect(preview.views).toEqual(['preview', 'source']);
    expect(preview.html).toContain('Provider title');

    const source = await renderPreview({ ...previewContext, requestedView: 'source' });
    expect(source.type).toBe('code');
    expect(source.view).toBe('source');
    expect(source.fileType).toBe('markdown');
    expect(source.language).toBe('markdown');
  });

  test('keeps SVG, HTML, and code capabilities inside their own providers', async () => {
    const svgContext = await createContext(
      'diagram.svg',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    );
    expect(resolvePreviewProvider(svgContext).id).toBe('image');
    const svgPreview = await renderPreview(svgContext);
    expect(svgPreview.views).toEqual(['preview', 'source']);
    expect(svgPreview.type).toBe('image');
    const svgSource = await renderPreview({ ...svgContext, requestedView: 'source' });
    expect(svgSource.type).toBe('code');
    expect(svgSource.language).toBe('xml');

    const htmlContext = await createContext('demo.html', '<h1>Demo</h1>');
    expect(resolvePreviewProvider(htmlContext).id).toBe('html');
    const htmlPreview = await renderPreview(htmlContext);
    expect(htmlPreview.url).toContain('/preview-html/demo.html');

    const codeContext = await createContext('main.ts', 'const answer: number = 42;');
    expect(resolvePreviewProvider(codeContext).id).toBe('code');
    const codePreview = await renderPreview(codeContext);
    expect(codePreview.views).toEqual(['source']);
    expect(codePreview.language).toBe('typescript');
  });

  test('forces oversized markdown into a bounded source preview', async () => {
    const context = await createContext(
      'large.md',
      'line\n'.repeat(MAX_TEXT_PREVIEW_LINES + 1)
    );
    const preview = await renderPreview(context);

    expect(preview.type).toBe('code');
    expect(preview.view).toBe('source');
    expect(preview.views).toEqual(['source']);
    expect(preview.forcedSource).toBe(true);
    expect(preview.truncated).toBe(true);
  });
});

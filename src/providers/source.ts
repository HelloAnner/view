import hljs from 'highlight.js';
import { languageForFile, readTextPreview } from '../file-types.ts';
import { createPreviewBase } from './types.ts';
import type { PreviewContext, PreviewPayload, PreviewView } from './types.ts';

interface SourcePreviewOptions {
  views?: PreviewView[];
  forcedSource?: boolean;
}

export async function createSourcePreview(
  context: PreviewContext,
  options: SourcePreviewOptions = {}
): Promise<PreviewPayload> {
  const textPreview = await readTextPreview(context.target, context.stat.size);
  const language = languageForFile(context.target)
    || context.classification.language
    || 'plaintext';
  const highlighted = hljs.getLanguage(language)
    ? hljs.highlight(textPreview.content, { language }).value
    : hljs.highlightAuto(textPreview.content).value;

  return {
    ...createPreviewBase(context, options.views || ['source']),
    type: 'code',
    view: 'source',
    html: highlighted,
    content: textPreview.content,
    language,
    lineCount: textPreview.lineCount,
    encoding: 'UTF-8',
    truncated: textPreview.truncated,
    forcedSource: options.forcedSource || false,
  };
}

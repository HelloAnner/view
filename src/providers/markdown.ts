import { MAX_TEXT_PREVIEW_BYTES, readTextPreview } from '../file-types.ts';
import { renderMarkdown } from '../markdown.ts';
import { createSourcePreview } from './source.ts';
import { createPreviewBase } from './types.ts';
import type { PreviewProvider } from './types.ts';

export const markdownPreviewProvider: PreviewProvider = {
  id: 'markdown',
  async render(context) {
    if (context.requestedView === 'source') {
      return createSourcePreview(context, { views: ['preview', 'source'] });
    }

    const textPreview = await readTextPreview(context.target, context.stat.size);
    if (context.stat.size > MAX_TEXT_PREVIEW_BYTES || textPreview.truncated) {
      return createSourcePreview(context, { views: ['source'], forcedSource: true });
    }

    const result = renderMarkdown(textPreview.content, context.relativePath);
    return {
      ...createPreviewBase(context, ['preview', 'source']),
      type: 'markdown',
      view: 'preview',
      html: result.html,
      documentTitle: result.title,
    };
  },
};

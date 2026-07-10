import { createSourcePreview } from './source.ts';
import { createPreviewBase } from './types.ts';
import type { PreviewProvider } from './types.ts';

export const htmlPreviewProvider: PreviewProvider = {
  id: 'html',
  async render(context) {
    if (context.requestedView === 'source') {
      return createSourcePreview(context, { views: ['preview', 'source'] });
    }

    const encodedPath = context.relativePath.split('/').map(encodeURIComponent).join('/');
    return {
      ...createPreviewBase(context, ['preview', 'source']),
      type: 'html',
      view: 'preview',
      url: `/preview-html/${encodedPath}?v=${encodeURIComponent(context.version)}`,
    };
  },
};

import path from 'node:path';
import { createSourcePreview } from './source.ts';
import { createFileUrl, createPreviewBase } from './types.ts';
import type { PreviewProvider } from './types.ts';

export const imagePreviewProvider: PreviewProvider = {
  id: 'image',
  async render(context) {
    const isSvg = path.extname(context.target).toLowerCase() === '.svg';
    if (isSvg && context.requestedView === 'source') {
      return createSourcePreview(context, { views: ['preview', 'source'] });
    }

    return {
      ...createPreviewBase(context, isSvg ? ['preview', 'source'] : ['preview']),
      type: 'image',
      view: 'preview',
      url: createFileUrl(context),
    };
  },
};

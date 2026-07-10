import { createFileUrl, createPreviewBase } from './types.ts';
import type { PreviewProvider } from './types.ts';

export const binaryPreviewProvider: PreviewProvider = {
  id: 'binary',
  async render(context) {
    return {
      ...createPreviewBase(context, ['preview']),
      type: 'binary',
      view: 'preview',
      url: createFileUrl(context),
    };
  },
};

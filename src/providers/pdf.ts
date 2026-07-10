import { createFileUrl, createPreviewBase } from './types.ts';
import type { PreviewProvider } from './types.ts';

export const pdfPreviewProvider: PreviewProvider = {
  id: 'pdf',
  async render(context) {
    return {
      ...createPreviewBase(context, ['preview']),
      type: 'pdf',
      view: 'preview',
      url: createFileUrl(context),
    };
  },
};

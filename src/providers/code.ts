import { createSourcePreview } from './source.ts';
import type { PreviewProvider } from './types.ts';

export const codePreviewProvider: PreviewProvider = {
  id: 'code',
  render(context) {
    return createSourcePreview(context);
  },
};

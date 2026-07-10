import { binaryPreviewProvider } from './binary.ts';
import { codePreviewProvider } from './code.ts';
import { htmlPreviewProvider } from './html.ts';
import { imagePreviewProvider } from './image.ts';
import { markdownPreviewProvider } from './markdown.ts';
import { pdfPreviewProvider } from './pdf.ts';
import type { PreviewContext, PreviewPayload, PreviewProvider } from './types.ts';

const previewProviders = new Map<string, PreviewProvider>([
  ['markdown', markdownPreviewProvider],
  ['code', codePreviewProvider],
  ['html', htmlPreviewProvider],
  ['image', imagePreviewProvider],
  ['pdf', pdfPreviewProvider],
  ['binary', binaryPreviewProvider],
]);

export function resolvePreviewProvider(context: PreviewContext): PreviewProvider {
  return previewProviders.get(context.classification.type) || binaryPreviewProvider;
}

export function renderPreview(context: PreviewContext): Promise<PreviewPayload> {
  return resolvePreviewProvider(context).render(context);
}

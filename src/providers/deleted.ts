import path from 'node:path';
import { getContentType } from '../file-types.ts';
import type { FileClassification } from '../file-types.ts';
import type { PreviewPayload } from './types.ts';

export function createDeletedPreview(
  target: string,
  relativePath: string,
  classification: FileClassification,
  version: string
): PreviewPayload {
  return {
    fileType: 'deleted',
    title: path.basename(target),
    path: relativePath,
    size: 0,
    readableSize: '—',
    mime: getContentType(target),
    modifiedAt: '',
    version,
    views: ['preview'],
    type: 'deleted',
    view: 'preview',
    previousFileType: classification.type,
  };
}

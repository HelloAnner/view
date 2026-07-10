import type { Stats } from 'node:fs';
import path from 'node:path';
import type { FileClassification } from '../file-types.ts';
import { formatBytes, getContentType } from '../file-types.ts';
import type { PreviewType } from '../types.ts';

export type PreviewView = 'preview' | 'source';

export interface PreviewContext {
  target: string;
  relativePath: string;
  stat: Stats;
  classification: FileClassification;
  requestedView: PreviewView;
  version: string;
}

export interface PreviewBase {
  fileType: PreviewType;
  title: string;
  path: string;
  size: number;
  readableSize: string;
  mime: string;
  modifiedAt: string;
  version: string;
  views: PreviewView[];
}

export interface PreviewPayload extends PreviewBase {
  type: PreviewType;
  view: PreviewView;
  [key: string]: unknown;
}

export interface PreviewProvider {
  readonly id: string;
  render(context: PreviewContext): Promise<PreviewPayload>;
}

export function createPreviewBase(
  context: PreviewContext,
  views: PreviewView[]
): PreviewBase {
  return {
    fileType: context.classification.type,
    title: path.basename(context.target),
    path: context.relativePath,
    size: context.stat.size,
    readableSize: formatBytes(context.stat.size),
    mime: getContentType(context.target),
    modifiedAt: context.stat.mtime.toISOString(),
    version: context.version,
    views,
  };
}

export function createFileUrl(context: PreviewContext): string {
  return `/api/file?path=${encodeURIComponent(context.relativePath)}&v=${encodeURIComponent(context.version)}`;
}

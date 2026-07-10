export interface PreviewOptions {
  root: string;
  port: number;
  open: boolean;
  launchMode: 'file' | 'directory';
  initialFile?: string;
}

export type PreviewType = 'markdown' | 'image' | 'pdf' | 'html' | 'code' | 'binary';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  previewType?: PreviewType;
  children?: TreeNode[];
  hasChildren?: boolean;
  loaded?: boolean;
}

export interface RenderResult {
  html: string;
  title?: string;
}

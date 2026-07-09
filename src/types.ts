export interface PreviewOptions {
  root: string;
  port: number;
  open: boolean;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

export interface RenderResult {
  html: string;
  title?: string;
}

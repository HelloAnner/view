export interface PreviewOptions {
  root: string;
  port: number;
  open: boolean;
  launchTitle: string;
  launchMode: 'file' | 'directory';
  treeMode: 'workspace' | 'git-changes';
  gitRoot?: string;
  initialFile?: string;
}

export type PreviewType = 'markdown' | 'image' | 'pdf' | 'html' | 'code' | 'binary' | 'deleted';

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

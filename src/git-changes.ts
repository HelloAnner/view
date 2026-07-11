import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { classifyFileName } from './file-types.ts';
import type { TreeNode } from './types.ts';

const GIT_OUTPUT_LIMIT = 64 * 1024 * 1024;
const GIT_CACHE_TTL_MS = 750;

export type GitLineChangeKind = 'added' | 'modified' | 'deleted';

export interface GitLineChange {
  line: number;
  kind: GitLineChangeKind;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function runGit(repoRoot: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['-C', repoRoot, '--literal-pathspecs', ...args],
      { encoding: null, maxBuffer: GIT_OUTPUT_LIMIT },
      (error, stdout, stderr) => {
        if (error) {
          const detail = Buffer.isBuffer(stderr) ? stderr.toString('utf-8').trim() : '';
          reject(new Error(detail || error.message));
          return;
        }
        resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));
      }
    );
  });
}

export function resolveGitRepositoryRoot(directory: string): string {
  try {
    const stdout = execFileSync(
      'git',
      ['-C', directory, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return path.resolve(stdout.trim());
  } catch {
    throw new Error(`"${directory}" is not inside a Git repository.`);
  }
}

export async function listGitChangedPaths(
  repoRoot: string,
  scopeRoot: string
): Promise<string[]> {
  const canonicalRepoRoot = fs.realpathSync(repoRoot);
  const canonicalScopeRoot = fs.realpathSync(scopeRoot);
  const scopeRelative = path.relative(canonicalRepoRoot, canonicalScopeRoot);
  if (scopeRelative.startsWith('..') || path.isAbsolute(scopeRelative)) {
    throw new Error('Git preview scope must be inside the repository.');
  }

  const pathspec = toPosixPath(scopeRelative) || '.';
  const outputs = await Promise.all([
    runGit(canonicalRepoRoot, ['diff', '--name-only', '-z', '--', pathspec]),
    runGit(canonicalRepoRoot, ['diff', '--cached', '--name-only', '-z', '--', pathspec]),
    runGit(canonicalRepoRoot, ['ls-files', '--others', '--exclude-standard', '-z', '--', pathspec]),
  ]);

  const changedPaths = new Set<string>();
  for (const output of outputs) {
    for (const repoRelative of output.toString('utf-8').split('\0')) {
      if (!repoRelative) continue;
      const absolute = path.resolve(canonicalRepoRoot, repoRelative);
      const relative = path.relative(canonicalScopeRoot, absolute);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) continue;

      try {
        if (fs.lstatSync(absolute).isDirectory()) continue;
      } catch {
        // Deleted working-tree files remain visible in the change tree.
      }
      changedPaths.add(toPosixPath(relative));
    }
  }

  return [...changedPaths].sort((a, b) => a.localeCompare(b));
}

export class GitChangeIndex {
  private cachedPaths: string[] = [];
  private cachedAt = 0;
  private inFlight: Promise<string[]> | null = null;

  constructor(
    private readonly repoRoot: string,
    private readonly scopeRoot: string
  ) {}

  async getPaths(): Promise<string[]> {
    if (Date.now() - this.cachedAt < GIT_CACHE_TTL_MS) return this.cachedPaths;
    if (this.inFlight) return this.inFlight;

    this.inFlight = listGitChangedPaths(this.repoRoot, this.scopeRoot)
      .then((paths) => {
        this.cachedPaths = paths;
        this.cachedAt = Date.now();
        return paths;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
}

export function parseGitLineChanges(diff: string, lineCount: number): GitLineChange[] {
  const changes = new Map<number, GitLineChangeKind>();
  const priority: Record<GitLineChangeKind, number> = {
    added: 1,
    modified: 2,
    deleted: 3,
  };
  const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;

  for (const match of diff.matchAll(hunkPattern)) {
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newStart = Number(match[3]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);

    if (newCount === 0) {
      const line = Math.min(Math.max(newStart, 1), Math.max(lineCount, 1));
      changes.set(line, 'deleted');
      continue;
    }

    const kind: GitLineChangeKind = oldCount === 0 ? 'added' : 'modified';
    for (let line = newStart; line < newStart + newCount; line++) {
      if (line < 1 || line > lineCount) continue;
      const current = changes.get(line);
      if (!current || priority[kind] > priority[current]) changes.set(line, kind);
    }
  }

  return [...changes]
    .map(([line, kind]) => ({ line, kind }))
    .sort((a, b) => a.line - b.line);
}

export async function getGitLineChanges(
  repoRoot: string,
  scopeRoot: string,
  scopeRelativePath: string,
  lineCount: number
): Promise<GitLineChange[]> {
  const canonicalRepoRoot = fs.realpathSync(repoRoot);
  const canonicalScopeRoot = fs.realpathSync(scopeRoot);
  const absolute = path.resolve(canonicalScopeRoot, scopeRelativePath);
  const repoRelativePath = path.relative(canonicalRepoRoot, absolute);
  if (repoRelativePath.startsWith('..') || path.isAbsolute(repoRelativePath)) return [];
  const pathspec = toPosixPath(repoRelativePath);

  const untracked = await runGit(canonicalRepoRoot, [
    'ls-files', '--others', '--exclude-standard', '-z', '--', pathspec,
  ]);
  if (untracked.length > 0) {
    return Array.from(
      { length: Math.max(lineCount, 1) },
      (_, index) => ({ line: index + 1, kind: 'added' as const })
    );
  }

  try {
    await runGit(canonicalRepoRoot, ['rev-parse', '--verify', 'HEAD']);
  } catch {
    return Array.from(
      { length: Math.max(lineCount, 1) },
      (_, index) => ({ line: index + 1, kind: 'added' as const })
    );
  }

  const diff = await runGit(canonicalRepoRoot, [
    'diff', '--no-color', '--unified=0', 'HEAD', '--', pathspec,
  ]);
  return parseGitLineChanges(diff.toString('utf-8'), lineCount);
}

export function buildGitDirectoryNode(
  scopeRoot: string,
  current: string,
  changedPaths: string[]
): TreeNode {
  const relativeDirectory = toPosixPath(path.relative(scopeRoot, current));
  const prefix = relativeDirectory ? `${relativeDirectory}/` : '';
  const children = new Map<string, TreeNode>();

  for (const changedPath of changedPaths) {
    if (prefix && !changedPath.startsWith(prefix)) continue;
    const remainder = prefix ? changedPath.slice(prefix.length) : changedPath;
    if (!remainder) continue;
    const separator = remainder.indexOf('/');
    const name = separator === -1 ? remainder : remainder.slice(0, separator);
    const childPath = prefix ? `${relativeDirectory}/${name}` : name;

    if (separator !== -1) {
      children.set(name, {
        name,
        path: childPath,
        type: 'directory',
        hasChildren: true,
        loaded: false,
      });
    } else if (!children.has(name)) {
      children.set(name, {
        name,
        path: childPath,
        type: 'file',
        previewType: classifyFileName(changedPath).type,
      });
    }
  }

  const sortedChildren = [...children.values()].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });

  return {
    name: path.basename(current),
    path: relativeDirectory || '.',
    type: 'directory',
    children: sortedChildren,
    hasChildren: sortedChildren.length > 0,
    loaded: true,
  };
}

export function searchGitChangedPaths(
  changedPaths: string[],
  query: string,
  limit = 200
): { results: TreeNode[]; truncated: boolean } {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return { results: [], truncated: false };

  const matches = changedPaths.filter((changedPath) => {
    const name = changedPath.split('/').pop() || changedPath;
    return name.toLowerCase().includes(normalizedQuery)
      || changedPath.toLowerCase().includes(normalizedQuery);
  });

  return {
    results: matches.slice(0, limit).map((changedPath) => ({
      name: changedPath.split('/').pop() || changedPath,
      path: changedPath,
      type: 'file',
      previewType: classifyFileName(changedPath).type,
    })),
    truncated: matches.length > limit,
  };
}

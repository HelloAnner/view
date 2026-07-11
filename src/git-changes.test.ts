import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildGitDirectoryNode,
  getGitLineChanges,
  listGitChangedPaths,
  parseGitLineChanges,
  resolveGitRepositoryRoot,
  searchGitChangedPaths,
} from './git-changes.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true })
    )
  );
});

function git(repo: string, ...args: string[]): void {
  execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
}

describe('Git change tree', () => {
  test('combines staged, unstaged, untracked, and deleted files within a subdirectory', async () => {
    const repo = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'view-git-'));
    temporaryDirectories.push(repo);
    const scope = path.join(repo, 'src');
    await fs.promises.mkdir(path.join(scope, 'removed'), { recursive: true });
    await fs.promises.mkdir(path.join(repo, 'other'), { recursive: true });
    await fs.promises.writeFile(path.join(repo, '.gitignore'), '*.tmp\n');
    await fs.promises.writeFile(path.join(scope, 'modified.ts'), 'export const value = 1;\n');
    await fs.promises.writeFile(path.join(scope, 'staged.ts'), 'export const staged = 1;\n');
    await fs.promises.writeFile(path.join(scope, 'removed', 'old.ts'), 'old content\n');
    await fs.promises.writeFile(path.join(repo, 'other', 'outside.ts'), 'outside\n');

    git(repo, 'init');
    git(repo, 'config', 'user.email', 'view@example.test');
    git(repo, 'config', 'user.name', 'view test');
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', 'baseline');

    await fs.promises.writeFile(path.join(scope, 'modified.ts'), 'export const value = 2;\n');
    await fs.promises.writeFile(path.join(scope, 'staged.ts'), 'export const staged = 2;\n');
    git(repo, 'add', 'src/staged.ts');
    await fs.promises.rm(path.join(scope, 'removed'), { recursive: true });
    await fs.promises.mkdir(path.join(scope, 'nested'));
    await fs.promises.writeFile(path.join(scope, 'nested', 'new.md'), '# New\n');
    await fs.promises.writeFile(path.join(scope, 'ignored.tmp'), 'ignored\n');
    await fs.promises.writeFile(path.join(repo, 'other', 'outside.ts'), 'changed outside\n');

    expect(resolveGitRepositoryRoot(scope)).toBe(fs.realpathSync(repo));
    const changedPaths = await listGitChangedPaths(repo, scope);
    expect(changedPaths).toEqual([
      'modified.ts',
      'nested/new.md',
      'removed/old.ts',
      'staged.ts',
    ]);

    const rootNode = buildGitDirectoryNode(scope, scope, changedPaths);
    expect(rootNode.children?.map((node) => `${node.type}:${node.path}`)).toEqual([
      'directory:nested',
      'directory:removed',
      'file:modified.ts',
      'file:staged.ts',
    ]);

    const removedNode = buildGitDirectoryNode(
      scope,
      path.join(scope, 'removed'),
      changedPaths
    );
    expect(removedNode.children?.map((node) => node.path)).toEqual(['removed/old.ts']);

    expect(searchGitChangedPaths(changedPaths, 'new').results).toEqual([
      {
        name: 'new.md',
        path: 'nested/new.md',
        type: 'file',
        previewType: 'markdown',
      },
    ]);

    expect(await getGitLineChanges(repo, scope, 'modified.ts', 1)).toEqual([
      { line: 1, kind: 'modified' },
    ]);
    expect(await getGitLineChanges(repo, scope, 'nested/new.md', 1)).toEqual([
      { line: 1, kind: 'added' },
    ]);
  });

  test('maps diff hunks to compact current-line gutter states', () => {
    const diff = [
      '@@ -1,0 +1,2 @@',
      '@@ -4,2 +6,1 @@',
      '@@ -10,2 +11,0 @@',
    ].join('\n');

    expect(parseGitLineChanges(diff, 20)).toEqual([
      { line: 1, kind: 'added' },
      { line: 2, kind: 'added' },
      { line: 6, kind: 'modified' },
      { line: 11, kind: 'deleted' },
    ]);
  });
});

#!/usr/bin/env bun
import { program } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { startServer } from './server.ts';
import type { PreviewOptions } from './types.ts';

program
  .name('v')
  .description('Preview Markdown files and directories in the browser')
  .version('0.1.0')
  .argument('[path]', 'file or directory to preview', '.')
  .option('-p, --port <number>', 'server port', '0')
  .option('--no-open', 'do not open browser automatically')
  .parse();

async function main() {
  const target = program.args[0] || '.';
  const resolved = path.resolve(target);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: "${target}" does not exist.`);
    process.exit(1);
  }

  if (fs.statSync(resolved).isFile()) {
    // For a single file, preview its parent directory and focus the file.
    const options: PreviewOptions = {
      root: path.dirname(resolved),
      port: parseInt(program.opts().port, 10) || 0,
      open: program.opts().open,
    };
    const { url } = await startServer(options);
    const fileUrl = `${url}/?file=${encodeURIComponent(path.basename(resolved))}`;
    console.log(`Previewing at ${fileUrl}`);
    if (options.open) openBrowser(fileUrl);
  } else {
    const options: PreviewOptions = {
      root: resolved,
      port: parseInt(program.opts().port, 10) || 0,
      open: program.opts().open,
    };
    const { url } = await startServer(options);
    console.log(`Previewing at ${url}`);
    if (options.open) openBrowser(url);
  }
}

function openBrowser(url: string) {
  try {
    execSync(`open "${url}"`, { stdio: 'ignore' });
  } catch {
    console.log(`Please open ${url} manually.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

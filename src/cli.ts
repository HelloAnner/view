#!/usr/bin/env bun
import { program } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { startServer } from './server.ts';
import type { PreviewOptions } from './types.ts';

// Bun compiled binaries sometimes duplicate the virtual script path in argv
// when the binary spawns itself. Remove the duplicate so commander parses
// arguments correctly.
if (
  process.argv[1] &&
  process.argv[2] === process.argv[1] &&
  process.argv[1].startsWith('/$bunfs/root/')
) {
  process.argv.splice(2, 1);
}

program
  .name('v')
  .description('Preview Markdown files and directories in the browser')
  .version('0.1.0')
  .argument('[path]', 'file or directory to preview', '.')
  .option('-p, --port <number>', 'server port', '0')
  .option('--no-open', 'do not open browser automatically')
  .option('--background', 'run as a background server (internal use)')
  .parse();

const MAX_PORT_FILE_WAIT_MS = 3000;
const PORT_FILE_POLL_MS = 80;

async function main() {
  const target = program.args[0] || '.';
  const resolved = path.resolve(target);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: "${target}" does not exist.`);
    process.exit(1);
  }

  const opts = program.opts();

  if (!opts.background) {
    const portFile = path.join(os.tmpdir(), `view-port-${process.pid}-${Date.now()}`);
    const env = { ...process.env, VIEW_PORT_FILE: portFile };
    const logFile = path.join(os.tmpdir(), `view-log-${process.pid}-${Date.now()}.log`);
    const logFd = fs.openSync(logFile, 'a');

    // When running as a compiled binary, process.argv[1] is a virtual path
    // (e.g. /$bunfs/root/view) that Bun injects and must not be passed to the
    // child. When running via `bun src/cli.ts`, argv[1] is the real script.
    const isCompiled = !fs.existsSync(process.argv[1]);
    const childArgs = isCompiled
      ? process.argv.slice(2).concat(['--background'])
      : [process.argv[1]].concat(process.argv.slice(2)).concat(['--background']);

    const child = spawn(process.execPath, childArgs, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env,
    });
    child.unref();

    const url = await waitForPortFile(portFile, MAX_PORT_FILE_WAIT_MS);
    if (url) {
      console.log(`Previewing at ${url}`);
    } else {
      console.log('Server started in background.');
    }
    process.exit(0);
  }

  const baseOptions = {
    port: parseInt(opts.port, 10) || 0,
    open: opts.open,
  };

  if (fs.statSync(resolved).isFile()) {
    const options: PreviewOptions = {
      root: path.dirname(resolved),
      ...baseOptions,
    };
    const { url } = await startServer(options);
    const fileUrl = `${url}/?file=${encodeURIComponent(path.basename(resolved))}`;
    await writePortFile(fileUrl);
    if (options.open) openBrowser(fileUrl);
  } else {
    const options: PreviewOptions = {
      root: resolved,
      ...baseOptions,
    };
    const { url } = await startServer(options);
    await writePortFile(url);
    if (options.open) openBrowser(url);
  }
}

async function writePortFile(url: string) {
  const file = process.env.VIEW_PORT_FILE;
  if (!file) return;
  try {
    await fs.promises.writeFile(file, url);
  } catch {
    // ignore
  }
}

async function waitForPortFile(file: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const content = await fs.promises.readFile(file, 'utf-8');
      try {
        await fs.promises.unlink(file);
      } catch {
        // ignore
      }
      return content.trim();
    } catch {
      await sleep(PORT_FILE_POLL_MS);
    }
  }
  try {
    await fs.promises.unlink(file);
  } catch {
    // ignore
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

# view

A lightweight CLI tool to preview local files and directories in a focused, read-only browser workspace.

## Features

- `v <path>` previews a file or directory instantly
- Directory preview starts a local temporary HTTP server
- Collapsible file explorer with lazy-loaded folders and file search
- Markdown renders as a focused document with a contextual heading outline
- Code and readable text open in an editor-style viewer with line numbers, wrapping, copy actions, and file metadata
- Markdown, HTML, and SVG files can switch between Preview and Source without losing scroll or zoom state
- Images open on a pannable canvas with fit, actual-size, and zoom controls
- HTML previews run in a sandboxed route isolated from the workspace UI
- File explorer navigation supports keyboard arrows, Home/End, Enter, `/` to filter, and `Ctrl/Cmd+B` to toggle
- Single-file launches start in a distraction-free full-width layout
- Supports relative-path images in Markdown
- Also previews images, PDFs, HTML pages, and downloadable binary files
- Light / dark theme follows your system preference
- Detects file changes every 5 seconds without resetting unchanged previews
- Large text files fall back to a clearly marked truncated source preview
- Read-only: never modifies your files

## Install

### Quick install

```bash
make install
```

This compiles a standalone binary and installs it to `~/.local/bin/v`; no `sudo` is required.

To install to a custom location:

```bash
make install PREFIX=$HOME/tools
```

### Development

```bash
bun install
bun run dev [path]
```

### Build

```bash
# Development bundle (requires Bun to run)
bun run build

# Standalone binary (no runtime dependency)
bun run compile
```

## Usage

```bash
# Preview current directory
v

# Preview a specific directory
v ./docs

# Preview a single Markdown or code file
v ./README.md
v ./src/server.ts

# Use a fixed port and do not open the browser
v ./docs --port 3000 --no-open
```

## Options

| Option        | Description                          |
|---------------|--------------------------------------|
| `-p, --port`  | Server port (default: random port)   |
| `--no-open`   | Do not open browser automatically    |
| `-h, --help`  | Show help                            |
| `-V, --version` | Show version                       |

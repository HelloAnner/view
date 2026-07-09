# view

A lightweight CLI tool to preview Markdown files and directories in the browser.

## Features

- `v <path>` previews a file or directory instantly
- Directory preview starts a local temporary HTTP server
- Left sidebar shows the directory tree
- Middle panel renders Markdown beautifully
- Right sidebar shows the document heading outline
- Supports relative-path images in Markdown
- Also previews code files (syntax highlighting), images, PDFs, and other files
- Light / dark theme follows your system preference
- Auto-refreshes every 5 seconds to reflect local file changes
- Read-only: never modifies your files

## Install

### Quick install (global)

```bash
make install
```

This compiles a standalone binary and installs it to `/usr/local/bin/v`.

To install to a custom location:

```bash
make install PREFIX=$HOME/.local
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

# Preview a single Markdown file
v ./README.md

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

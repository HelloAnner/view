PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin
BUN ?= bun

BINARY = dist/view
ENTRY = src/cli.ts

.PHONY: all deps check build install uninstall clean

all: build

deps:
	@command -v $(BUN) >/dev/null 2>&1 || { echo "Bun is required for make build; use make install for automatic setup."; exit 1; }
	$(BUN) install --frozen-lockfile

check: deps
	$(BUN) x tsc --noEmit
	$(BUN) test

build: deps
	$(BUN) build $(ENTRY) --outfile $(BINARY) --compile

install:
	@PREFIX="$(PREFIX)" BINDIR="$(BINDIR)" bash scripts/install.sh

uninstall:
	rm -f $(BINDIR)/v

clean:
	rm -rf dist

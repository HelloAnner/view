PREFIX ?= $(HOME)/.local
BINDIR ?= $(PREFIX)/bin

BINARY = dist/view
ENTRY = src/cli.ts

.PHONY: all build install uninstall clean

all: build

build:
	bun build $(ENTRY) --outfile $(BINARY) --compile

install: build
	install -d $(BINDIR)
	install -m 755 $(BINARY) $(BINDIR)/v

uninstall:
	rm -f $(BINDIR)/v

clean:
	rm -rf dist

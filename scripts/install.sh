#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${PREFIX:-$HOME/.local}"
BINDIR="${BINDIR:-$PREFIX/bin}"
BINARY="$PROJECT_ROOT/dist/view"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nError: %s\n' "$1" >&2
  exit 1
}

download_bun_installer() {
  local destination="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -q https://bun.sh/install -O "$destination"
  else
    fail "Bun is missing and neither curl nor wget is available."
  fi
}

ensure_bun() {
  if [[ -n "${BUN_BIN:-}" && -x "$BUN_BIN" ]]; then
    return
  fi

  if command -v bun >/dev/null 2>&1; then
    BUN_BIN="$(command -v bun)"
    return
  fi

  if [[ -x "$HOME/.bun/bin/bun" ]]; then
    BUN_BIN="$HOME/.bun/bin/bun"
    return
  fi

  log "Installing Bun into $HOME/.bun"
  local temporary_directory installer
  temporary_directory="$(mktemp -d)"
  installer="$temporary_directory/bun-install.sh"
  trap 'rm -rf "$temporary_directory"' RETURN
  download_bun_installer "$installer"
  BUN_INSTALL="$HOME/.bun" bash "$installer"
  BUN_BIN="$HOME/.bun/bin/bun"
  [[ -x "$BUN_BIN" ]] || fail "Bun installation did not produce $BUN_BIN."
  rm -rf "$temporary_directory"
  trap - RETURN
}

append_once() {
  local file="$1" line="$2"
  mkdir -p "$(dirname "$file")"
  touch "$file"
  if ! grep -Fqx "$line" "$file"; then
    printf '\n# view CLI\n%s\n' "$line" >> "$file"
  fi
}

configure_path() {
  local user_shell shell_name path_expression export_line
  user_shell="${SHELL:-}"
  if [[ -z "$user_shell" || ! -x "$user_shell" ]]; then
    if [[ -x /bin/zsh ]]; then user_shell=/bin/zsh; else user_shell=/bin/bash; fi
  fi
  shell_name="$(basename "$user_shell")"

  if [[ "$BINDIR" == "$HOME/"* ]]; then
    path_expression='$HOME/'"${BINDIR#"$HOME"/}"
  else
    path_expression="$BINDIR"
  fi
  export_line='export PATH="'"$path_expression"':$PATH"'

  case "$shell_name" in
    zsh)
      append_once "$HOME/.zshrc" "$export_line"
      ;;
    bash)
      append_once "$HOME/.bashrc" "$export_line"
      append_once "$HOME/.bash_profile" "$export_line"
      ;;
    fish)
      append_once "$HOME/.config/fish/config.fish" "fish_add_path \"$BINDIR\""
      ;;
    *)
      append_once "$HOME/.profile" "$export_line"
      ;;
  esac

  printf '%s\n' "$user_shell"
}

verify_fresh_shell() {
  local user_shell="$1" shell_name resolved
  shell_name="$(basename "$user_shell")"
  case "$shell_name" in
    zsh|bash|fish)
      resolved="$("$user_shell" -lic 'command -v v' 2>/dev/null | tail -n 1)"
      ;;
    *)
      resolved="$("$user_shell" -lc 'command -v v' 2>/dev/null | tail -n 1)"
      ;;
  esac

  [[ "$resolved" == "$BINDIR/v" ]] || fail \
    "A fresh $shell_name shell resolved v to '${resolved:-nothing}', expected '$BINDIR/v'."
  "$BINDIR/v" --version >/dev/null
}

ensure_bun
export PATH="$(dirname "$BUN_BIN"):$PATH"

cd "$PROJECT_ROOT"

log "Installing locked dependencies"
"$BUN_BIN" install --frozen-lockfile

log "Running TypeScript checks"
"$BUN_BIN" x tsc --noEmit

log "Running tests"
"$BUN_BIN" test

log "Compiling standalone binary"
mkdir -p "$PROJECT_ROOT/dist"
"$BUN_BIN" build src/cli.ts --outfile "$BINARY" --compile

log "Installing v into $BINDIR"
install -d "$BINDIR"
install -m 755 "$BINARY" "$BINDIR/v"

log "Configuring shell PATH"
USER_SHELL="$(configure_path)"

log "Verifying installation in a fresh shell"
verify_fresh_shell "$USER_SHELL"

printf '\nInstalled successfully:\n  %s\n  version %s\n' \
  "$BINDIR/v" "$($BINDIR/v --version)"

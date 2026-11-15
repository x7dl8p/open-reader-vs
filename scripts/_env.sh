#!/usr/bin/env bash
# Shared by the publish scripts. Loads one token from the environment, or from
# ENV_FILE (default: the repo's gitignored .env), without ever printing it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
VERSION="$(node -p "require('$ROOT/package.json').version")"
VSIX="$ROOT/open-reader-$VERSION.vsix"

load_token() {
  local name="$1"
  if [ -z "${!name:-}" ] && [ -f "$ENV_FILE" ]; then
    local value
    value="$(grep -m1 "^$name=" "$ENV_FILE" | cut -d= -f2- || true)"
    export "$name=$value"
  fi
  if [ -z "${!name:-}" ]; then
    echo "Missing $name: set it in the environment or in $ENV_FILE" >&2
    exit 1
  fi
}

ensure_vsix() {
  if [ ! -f "$VSIX" ]; then
    (cd "$ROOT" && pnpm exec vsce package --no-dependencies -o "$VSIX")
  fi
}

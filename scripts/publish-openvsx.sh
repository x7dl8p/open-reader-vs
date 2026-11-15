#!/usr/bin/env bash
# Publish the current version to Open VSX. Needs OVSX_PAT.
source "$(dirname "$0")/_env.sh"
load_token OVSX_PAT
ensure_vsix
cd "$ROOT" && pnpm exec ovsx publish "$VSIX"
echo "Open VSX: published $VERSION"

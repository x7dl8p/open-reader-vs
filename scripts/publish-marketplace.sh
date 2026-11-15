#!/usr/bin/env bash
# Publish the current version to the VS Code Marketplace. Needs VSCE_PAT.
source "$(dirname "$0")/_env.sh"
load_token VSCE_PAT
ensure_vsix
cd "$ROOT" && pnpm exec vsce publish --no-dependencies --packagePath "$VSIX"
echo "Marketplace: published $VERSION"

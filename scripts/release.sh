#!/usr/bin/env bash
# Full release of the version in package.json: package, push main and the tag,
# create the GitHub release with the VSIX, then publish to both stores.
# Release notes come from the CHANGELOG section for this version.
source "$(dirname "$0")/_env.sh"
cd "$ROOT"
TAG="v$VERSION"

rm -f "$VSIX"
ensure_vsix

git push origin HEAD
git rev-parse "$TAG" >/dev/null 2>&1 || git tag "$TAG"
git push origin "$TAG"

NOTES="$(awk -v v="## $VERSION" '$0==v{f=1;next} /^## /{f=0} f' CHANGELOG.md)"
gh release view "$TAG" >/dev/null 2>&1 || gh release create "$TAG" "$VSIX" --title "Open Reader $VERSION" --notes "$NOTES"

"$ROOT/scripts/publish-marketplace.sh"
"$ROOT/scripts/publish-openvsx.sh"
echo "Released $TAG everywhere."

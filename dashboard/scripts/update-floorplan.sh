#!/usr/bin/env bash
# Vendors a pinned release of Floorplan (https://github.com/haydenschmitty/floorplan,
# MIT) into dashboard/vendor/floorplan: the map viewer the App map page shows
# (its page, add-ons, layout engine, fonts and their licenses).
#
#   dashboard/scripts/update-floorplan.sh floorplan--v0.11.0
#
# Use the same release as the platform's vendor/floorplan, so the viewer reads
# the maps the worker builds.
#
# It clones the release tag, checks every file it copies against the release's
# own CHECKSUMS.txt, copies only those files, and records the tag in
# vendor/floorplan/VERSION. Vendored files are never edited: anything
# CoderHelm-specific lives in our adapter (public/app-map/frame.js,
# public/app-map/present.js and scripts/floorplan-frame.mjs, which writes
# public/app-map/viewer.js from these files). present.js uses only the
# viewer's extension API (window.Floorplan) and a few of its class names; see
# its header. After a bump, run:
#   npm run floorplan && npx playwright test e2e/app-map.spec.ts e2e/app-map-present.spec.ts
set -euo pipefail

TAG="${1:?usage: scripts/update-floorplan.sh <release tag, like floorplan--v0.11.0>}"
case "$TAG" in floorplan--v[0-9]*.[0-9]*.[0-9]*) ;; *) echo "not a Floorplan release tag: $TAG" >&2; exit 1;; esac
REPO="https://github.com/haydenschmitty/floorplan.git"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/vendor/floorplan"
# What the viewer needs, as build.mjs assembles a map page from it.
KEEP=(
  LICENSE
  CHECKSUMS.txt
  skills/floorplan/assets/viewer.html
  skills/floorplan/assets/ui
  skills/floorplan/assets/graph-query.js
  skills/floorplan/assets/logo.png
  skills/floorplan/assets/favicon.png
  skills/floorplan/assets/vendor
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$TAG" "$REPO" "$WORK/src"

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
# Every file we copy must be listed in CHECKSUMS.txt with a matching hash.
checked=0
while IFS= read -r f; do
  rel="${f#"$WORK/src/"}"
  [ "$rel" = CHECKSUMS.txt ] && continue
  [ "$rel" = LICENSE ] && continue
  want="$(awk -v p="$rel" '$2 == p { print $1 }' "$WORK/src/CHECKSUMS.txt")"
  if [ -z "$want" ]; then echo "not in CHECKSUMS.txt: $rel" >&2; exit 1; fi
  if [ "$(sha "$f")" != "$want" ]; then echo "checksum mismatch: $rel" >&2; exit 1; fi
  checked=$((checked + 1))
done < <(for k in "${KEEP[@]}"; do find "$WORK/src/$k" -type f; done)

rm -rf "$DEST"
mkdir -p "$DEST"
for k in "${KEEP[@]}"; do
  mkdir -p "$DEST/$(dirname "$k")"
  cp -R "$WORK/src/$k" "$DEST/$k"
done
echo "$TAG" > "$DEST/VERSION"
echo "Vendored Floorplan $TAG: $checked files checked against CHECKSUMS.txt"

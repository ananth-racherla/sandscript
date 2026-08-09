#!/usr/bin/env bash
# Prints a stable hash of everything that affects the compiled WASM output
# (src/**, Cargo.toml, Cargo.lock). Used both to record what the checked-in
# frontend/src/wasm/ was built from (see frontend/package.json's wasm:build
# script) and, in CI, to verify it hasn't drifted from the current Rust
# source — see .github/workflows/ci.yml.
#
# Hashes file contents *and* paths (so renames/adds/removals count as a
# change too), with a locale-independent sort so the result is identical
# regardless of machine/environment.
set -euo pipefail
cd "$(dirname "$0")/.."
find src Cargo.toml Cargo.lock -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | awk '{print $1}'

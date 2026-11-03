#!/usr/bin/env bash
set -euo pipefail
cd /mnt/c/apps/games-reducer
export CARGO_HOME="$PWD/.cache/cargo-linux"
export RUSTUP_HOME="$PWD/.cache/rustup-linux"
export PATH="$CARGO_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export CARGO_TARGET_DIR=/tmp/games-reducer-worker-target
mkdir -p vendor/jgenesis/frontend/reducer-worker/src
cp engine-worker/Cargo.toml vendor/jgenesis/frontend/reducer-worker/
cp engine-worker/src/lib.rs vendor/jgenesis/frontend/reducer-worker/src/
cd vendor/jgenesis
# The new frontend changes only workspace membership in the lockfile; use cached dependencies.
cargo +nightly build --offline -p reducer-worker --release --target wasm32-unknown-unknown
cd /mnt/c/apps/games-reducer
mkdir -p public/engine/worker
.cache/wasm-bindgen-0.2.114-x86_64-unknown-linux-musl/wasm-bindgen /tmp/games-reducer-worker-target/wasm32-unknown-unknown/release/reducer_worker.wasm --target web --out-dir public/engine/worker

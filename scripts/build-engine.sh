#!/usr/bin/env bash
set -euo pipefail
cd /mnt/c/apps/games-reducer
export CARGO_HOME="$PWD/.cache/cargo-linux"
export RUSTUP_HOME="$PWD/.cache/rustup-linux"
export PATH="$CARGO_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
# WSL's native filesystem keeps compilation fast; artifacts stay separate from the live engine.
export CARGO_TARGET_DIR=/tmp/games-reducer-wasm-target
cd vendor/jgenesis/frontend/jgenesis-web
cargo +nightly build -p jgenesis-web --locked --release --target wasm32-unknown-unknown -Z build-std=panic_abort,std
cd /mnt/c/apps/games-reducer
mkdir -p .cache/engine-p2/pkg
.cache/wasm-bindgen-0.2.114-x86_64-unknown-linux-musl/wasm-bindgen /tmp/games-reducer-wasm-target/wasm32-unknown-unknown/release/jgenesis_web.wasm --target web --out-dir .cache/engine-p2/pkg

#!/usr/bin/env bash
set -euo pipefail
cd /mnt/c/apps/games-reducer
export CARGO_HOME="$PWD/.cache/cargo-linux"
export RUSTUP_HOME="$PWD/.cache/rustup-linux"
export PATH="$CARGO_HOME/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
mkdir -p .cache
if [ ! -x "$CARGO_HOME/bin/rustup" ]; then
  curl --fail --location --output .cache/rustup-init-linux https://static.rust-lang.org/rustup/dist/x86_64-unknown-linux-gnu/rustup-init
  chmod +x .cache/rustup-init-linux
  .cache/rustup-init-linux -y --no-modify-path --profile minimal --default-toolchain nightly
fi
rustup component add rust-src --toolchain nightly
rustup target add wasm32-unknown-unknown --toolchain nightly
rustc +nightly --version

#!/usr/bin/env bash
set -euo pipefail

echo "[FeatherWorks] macOS Setup starten..."

if ! command -v brew >/dev/null 2>&1; then
  echo "Installiere Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
  echo "Homebrew bereits installiert"
fi

echo "Aktualisiere Brew..."
brew update

if ! command -v rustc >/dev/null 2>&1; then
  echo "Installiere Rust (rustup)..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
else
  echo "Rust bereits installiert"
fi

# Lade Cargo Env falls notwendig
if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

echo "Installiere Node.js LTS (v20) & Tools"
brew install node cmake pkg-config || true

echo "Installiere Tauri CLI global"
npm install -g @tauri-apps/cli

echo "Fertig! Starte dev server mit: npm run dev"

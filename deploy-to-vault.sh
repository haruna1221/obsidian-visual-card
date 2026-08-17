#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
VAULT_PLUGIN_DIR="/Users/haruna/Library/Mobile Documents/iCloud~md~obsidian/Documents/obsidian_haruna/.obsidian/plugins/visual-card"

cd "$PROJECT_DIR"
npm run build

for file in main.js manifest.json styles.css; do
  install -m 0644 "$PROJECT_DIR/$file" "$VAULT_PLUGIN_DIR/$file"
done

echo "Visual Card をボルトへ反映しました。Obsidianでプラグインを再読み込みしてください。"

import fs from "node:fs";
import path from "node:path";

const scratchFile = "/Users/haruna/.gemini/antigravity/brain/c96b2b31-3222-4dc0-bf89-9fe81c061897/scratch/compiled-main.js";
const devDir = "/Users/haruna/Documents/Obsidian外アーカイブ/開発リポジトリ/obsidian-plugins/visual-card";
const vaultPluginDir = "/Users/haruna/Library/Mobile Documents/iCloud~md~obsidian/Documents/obsidian_haruna/.obsidian/plugins/visual-card";

if (!fs.existsSync(scratchFile)) {
  console.error("Scratch file not found!");
  process.exit(1);
}

const compiledCode = fs.readFileSync(scratchFile, "utf-8");

// Write to dev repo
fs.writeFileSync(path.join(devDir, "main.js"), compiledCode, "utf-8");
console.log("Updated dev repo main.js");

// Write to vault plugin dir
fs.writeFileSync(path.join(vaultPluginDir, "main.js"), compiledCode, "utf-8");
console.log("Updated vault plugin main.js");

// Copy styles.css to vault
fs.copyFileSync(path.join(devDir, "styles.css"), path.join(vaultPluginDir, "styles.css"));
console.log("Updated vault plugin styles.css");

console.log("All plugin files synced successfully!");

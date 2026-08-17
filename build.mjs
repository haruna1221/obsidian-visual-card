import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const devDir = "/Users/haruna/Documents/Obsidian外アーカイブ/開発リポジトリ/obsidian-plugins/visual-card";
const scratchFile = "/Users/haruna/.gemini/antigravity/brain/c96b2b31-3222-4dc0-bf89-9fe81c061897/scratch/compiled-main.js";

const tsSource = fs.readFileSync(path.join(devDir, "src/main.ts"), "utf-8");
const eaSource = fs.readFileSync(path.join(devDir, "src/excalidraw-api.ts"), "utf-8");

// Inline excalidraw-api into tsSource
const inlinedTs = tsSource.replace(
  'import { getExcalidrawAutomate } from "./excalidraw-api";',
  eaSource.replace('export function getExcalidrawAutomate', 'function getExcalidrawAutomate')
);

const result = ts.transpileModule(inlinedTs, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
  }
});

fs.writeFileSync(scratchFile, result.outputText, "utf-8");
console.log("Wrote compiled main.js to scratch successfully!");

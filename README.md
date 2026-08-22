# Visual Card — Phase 1

Visual Card creates a Markdown knowledge card and a paired Excalidraw drawing. This repository currently implements only the technical-validation phase.

## What is included

- Command: `Visual Card: 新しいVisual Cardを作成`
- Context-aware commands to open an active Visual Card's handwriting or text side
- Public Obsidian view-header buttons for handwriting/text switching (technical validation for the future tab UI)
- Optional Japanese title dialog; blank input becomes `無題`
- Local-time filename: `YYMMDD-HHmm-タイトル.md`, with a numeric suffix on collision
- Markdown frontmatter with `type`, `date`, `created`, `updated`, and `drawing`
- ExcalidrawAutomate public API to create and open the paired drawing
- A 1200×900 Excalidraw Frame and Helvetica `YYYY.MM.DD` text at its upper-left
- Folder creation through Obsidian's Vault API
- Markdown rollback when drawing creation fails
- `updated` is refreshed after either the Markdown or paired drawing changes
- Missing drawing detection and the `Visual Card: 欠損した手書き面を再作成` command
- `Visual Card: 現在のカードをCanvasへ追加` lets the user choose the handwriting or text side, then adds it as a standard file node
- `Visual Card: 現在の手書き面をCanvasへ追加` adds the paired Excalidraw file as a standard file node
- Empty Canvas JSON is normalized with `nodes` and `edges` arrays before a card is added
- If no Canvas file exists, the Canvas picker offers `新規キャンバスを作成` and continues adding the selected card to the new Canvas
- Header actions provide handwriting/text switching, Canvas add/open shortcuts, and card renaming
- `Visual Card: 現在のカード名を変更` renames both the Markdown card and its paired Excalidraw file after the fixed `YYMMDD-HHmm-` prefix, then updates the authoritative `drawing` frontmatter path
- Settings for card folders, Frame style, date font/size, and the 4:3 Frame width

## Explicit Phase 1 limits

- The Excalidraw Frame is visual guidance, not a hard clipping boundary: Excalidraw remains an infinite canvas.
- The date/frame are not locked because the documented Automate creation API does not expose a stable lock operation.
- The public API documented for ExcalidrawAutomate does not guarantee switching the currently selected tool, Pencil-vs-finger input splitting, toolbar minimization, or returning to a pen after erasing. This build intentionally does not use DOM or private-plugin APIs for these.
- There is no card-specific two-sided tab view yet. The current header buttons validate safe in-app switching without DOM hooks. Canvas placement is intentionally simple and can be adjusted manually.

## Installation via BRAT (Obsidian42 - BRAT)

1. Install and enable the **Obsidian42 - BRAT** community plugin in Obsidian.
2. In Obsidian settings, go to **BRAT** > **Add Beta plugin**.
3. Enter the GitHub repository URL (e.g. `https://github.com/<username>/<repo>` or `<username>/<repo>`).
4. Click **Add Plugin**. BRAT will automatically download `manifest.json`, `main.js`, and `styles.css`.
5. Enable **Visual Card** in Community plugins. (Ensure **Excalidraw** is also installed and enabled).

## Manual Build and Install

1. In this plugin folder, run `npm install`.
2. Run `npm run build`; this produces `main.js` beside `manifest.json` and `styles.css`.
3. Copy `manifest.json`, `main.js`, and `styles.css` into your vault under `.obsidian/plugins/visual-card/`.
4. In Obsidian, enable **Visual Card** under Community plugins. Excalidraw must also be enabled.

## Development

- `npm run dev` builds an unminified bundle with an inline source map.
- `npm run build` creates the production bundle.
- The plugin does not use Node filesystem APIs at runtime; Vault reads/writes go through Obsidian APIs.

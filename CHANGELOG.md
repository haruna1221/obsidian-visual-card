# Changelog

## [Unreleased]

### Added

- Canvasファイルが1件もない場合、Canvas選択画面から「新規キャンバスを作成」を実行できるようにした。
- 新規Canvas作成後、選択したVisual Cardのテキスト面または手書き面を続けて追加できるようにした。

### Fixed

- 空のCanvasが`{}`として保存されていても、`nodes`と`edges`を補完してカードを追加できるようにした。
- `nodes`または`edges`が未定義のCanvasを、追加処理前に不正形式として扱わないようにした。

### Verification

- `npm run build`
- `npx tsc --noEmit`
- `node --check main.js`

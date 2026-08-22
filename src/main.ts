import { App, ItemView, Modal, Notice, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, addIcon, normalizePath, setIcon, setTooltip } from "obsidian";
import { getExcalidrawAutomate } from "./excalidraw-api";

const UNTITLED = "無題";
const PENCIL_SPARKLES_ICON = "visual-card-pencil-sparkles";
const CANVAS_ADD_ICON = "visual-card-canvas-add";
const FLIP_ICON = "switch";
const PENCIL_SPARKLES_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 3H8" />
    <path d="m15.007 5.008 3.987 3.986" />
    <path d="M20 15v4" />
    <path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="M22 17h-4" />
    <path d="M4 5v4" />
    <path d="M6 7H2" />
    <path d="M9 2v2" />
  </svg>
`;
const CANVAS_ADD_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="12" height="12" rx="2" />
    <path d="M7 7h4" />
    <path d="M7 11h4" />
    <path d="M18 15v6" />
    <path d="M15 18h6" />
  </svg>
`;

interface CardNames {
  stem: string;
  markdownPath: string;
  drawingCandidatePath: string;
}

interface VisualCardFiles {
  card: TFile;
  drawing: TFile | null;
  drawingPath: string;
}

interface CanvasVisualCardTarget {
  nodeId: string;
  node: any;
  card: TFile;
  drawing: TFile | null;
  drawingPath: string;
  isDrawing: boolean;
}

interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  file?: string;
}

interface CanvasData {
  nodes: CanvasNode[];
  edges: unknown[];
}

type CanvasCardSide = "handwriting" | "text";

interface VisualCardSettings {
  cardFolder: string;
  drawingsFolder: string;
  penColor: string;
  penWidth: number;
  penOpacity: number;
  dateFontFamily: number;
  dateFontSize: number;
  frameWidth: number;
}

const DEFAULT_SETTINGS: VisualCardSettings = {
  cardFolder: "VisualCards",
  drawingsFolder: "VisualCards/drawings",
  penColor: "#000000",
  penWidth: 1,
  penOpacity: 100,
  dateFontFamily: 2,
  dateFontSize: 18,
  frameWidth: 1200,
};

export default class VisualCardPlugin extends Plugin {
  private cardActionEls = new WeakMap<ItemView, HTMLElement[]>();
  private canvasMenuObserver: MutationObserver | null = null;
  private timestampTimers = new Map<string, number>();
  private timestampWrites = new Map<string, number>();
  settings: VisualCardSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    addIcon(PENCIL_SPARKLES_ICON, PENCIL_SPARKLES_SVG);
    addIcon(CANVAS_ADD_ICON, CANVAS_ADD_SVG);
    this.addSettingTab(new VisualCardSettingTab(this.app, this));

    this.addRibbonIcon("file-pen", "新しいVisual Cardを作成", async () => {
      await this.promptAndCreateVisualCard();
    });

    this.addCommand({
      id: "create-visual-card",
      name: "新しいVisual Cardを作成",
      icon: "file-pen",
      callback: async () => this.promptAndCreateVisualCard(),
    });
    this.addCommand({
      id: "open-visual-card",
      name: "Visual Cardとして開く",
      callback: async () => this.runForActiveVisualCard((files) => this.openHandwriting(files)),
    });
    this.addCommand({
      id: "open-visual-card-handwriting",
      name: "手書き面を開く",
      callback: async () => this.runForActiveVisualCard((files) => this.openHandwriting(files)),
    });
    this.addCommand({
      id: "open-visual-card-text",
      name: "テキスト面を開く",
      icon: "file-type-corner",
      callback: async () => this.runForActiveVisualCard((files) => this.openText(files)),
    });
    this.addCommand({
      id: "recreate-missing-handwriting",
      name: "欠損した手書き面を再作成",
      callback: async () => this.runForActiveVisualCard((files) => this.recreateMissingDrawing(files)),
    });
    this.addCommand({
      id: "add-current-card-to-canvas",
      name: "現在のカードをCanvasへ追加",
      callback: async () => this.runForActiveVisualCard((files) => this.addCardToCanvas(files)),
    });
    this.addCommand({
      id: "add-current-handwriting-to-canvas",
      name: "現在の手書き面をCanvasへ追加",
      callback: async () => this.runForActiveVisualCard((files) => this.addHandwritingToCanvas(files)),
    });
    this.addCommand({
      id: "open-canvases-containing-current-card",
      name: "追加済みCanvasを開く",
      callback: async () => this.runForActiveVisualCard((files) => this.openContainingCanvas(files)),
    });
    this.addCommand({
      id: "rename-current-card-title",
      name: "現在のカード名を変更",
      icon: "text-cursor-input",
      callback: async () => this.runForActiveVisualCard((files) => this.renameCardTitle(files)),
    });
    this.addCommand({
      id: "flip-canvas-card",
      name: "Canvas: 選択したカードを表裏フリップ",
      callback: async () => this.flipSelectedCanvasCards(),
    });
    this.addCommand({
      id: "open-canvas-card-handwriting",
      name: "Canvas: 選択カードの手書き面を開く（Excalidraw）",
      callback: async () => this.openCanvasCardHandwriting(),
    });
    this.addCommand({
      id: "open-canvas-card-text",
      name: "Canvas: 選択カードのテキスト面を開く（Markdown）",
      icon: "file-type-corner",
      callback: async () => this.openCanvasCardText(),
    });
    this.addCommand({
      id: "duplicate-canvas-card",
      name: "Canvas: 選択カードを複製",
      icon: "copy-plus",
      callback: async () => this.duplicateSelectedCanvasCards(),
    });
    this.addCommand({
      id: "rename-canvas-card",
      name: "Canvas: 選択カード名を変更",
      icon: "text-cursor-input",
      callback: async () => this.renameCanvasCard(),
    });
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleVaultModify(file)));

    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.workspace.on("active-leaf-change", () => {
        this.refreshCardHeaderActions();
        this.setupCanvasMenuHook();
      }));
      this.registerEvent(this.app.workspace.on("file-open", () => window.setTimeout(() => {
        this.refreshCardHeaderActions();
        this.setupCanvasMenuHook();
      }, 0)));
      this.refreshCardHeaderActions();
      this.setupCanvasMenuHook();
    });
  }

  onunload(): void {
    if (this.canvasMenuObserver) {
      this.canvasMenuObserver.disconnect();
      this.canvasMenuObserver = null;
    }
    // Clean up any remaining visual card header action buttons and menu items across the entire app
    document.querySelectorAll(".visual-card-header-action, .visual-card-canvas-menu-item").forEach((el) => el.remove());
  }

  private refreshCardHeaderActions(): void {
    const view = this.app.workspace.activeLeaf?.view;
    if (!(view instanceof ItemView)) return;
    this.clearCardHeaderActions(view);

    // Canvas view actions
    if (view.getViewType() === "canvas") {
      const actions: HTMLElement[] = [];
      const flip = view.addAction(FLIP_ICON, "Visual Card: 選択カードを表裏フリップ", () => {
        void this.flipSelectedCanvasCards();
      });
      flip.addClass("visual-card-header-action", "visual-card-canvas-header-action");
      actions.push(flip);

      const handwriting = view.addAction(PENCIL_SPARKLES_ICON, "Visual Card: 手書き面を編集（Excalidraw）", () => {
        void this.openCanvasCardHandwriting();
      });
      handwriting.addClass("visual-card-header-action", "visual-card-canvas-header-action");
      actions.push(handwriting);

      const text = view.addAction("file-type-corner", "Visual Card: テキスト面を編集（Markdown）", () => {
        void this.openCanvasCardText();
      });
      text.addClass("visual-card-header-action", "visual-card-canvas-header-action");
      actions.push(text);

      const rename = view.addAction("text-cursor-input", "Visual Card: カード名を変更", () => {
        void this.renameCanvasCard();
      });
      rename.addClass("visual-card-header-action", "visual-card-canvas-header-action");
      actions.push(rename);

      this.cardActionEls.set(view, actions);
      return;
    }

    // Markdown / Excalidraw view actions
    const files = this.getActiveVisualCard();
    if (!files) return;

    const handwriting = view.addAction(PENCIL_SPARKLES_ICON, "Visual Card: 手書き", () => {
      void this.openHandwriting(files);
    });
    handwriting.addClass("visual-card-header-action", "visual-card-handwriting-action");
    const text = view.addAction("file-type-corner", "Visual Card: テキスト", () => {
      void this.openText(files);
    });
    text.addClass("visual-card-header-action");
    const actions = [handwriting, text];
    const addCanvas = view.addAction(CANVAS_ADD_ICON, "Visual Card: Canvasへ追加", () => {
      void this.addCardToCanvas(files);
    });
    addCanvas.addClass("visual-card-header-action");
    actions.push(addCanvas);
    const openCanvas = view.addAction("layout-dashboard", "Visual Card: 追加済みCanvasを開く", () => {
      void this.openContainingCanvas(files);
    });
    openCanvas.addClass("visual-card-header-action");
    actions.push(openCanvas);
    const renameCard = view.addAction("text-cursor-input", "Visual Card: カード名を変更", () => {
      void this.renameCardTitle(files);
    });
    renameCard.addClass("visual-card-header-action");
    actions.push(renameCard);
    if (!files.drawing) {
      const recreate = view.addAction("refresh-cw", "Visual Card: 手書き面を再作成", () => {
        void this.recreateMissingDrawing(files);
      });
      recreate.addClass("visual-card-header-action");
      actions.push(recreate);
    }
    this.cardActionEls.set(view, actions);
  }

  private clearCardHeaderActions(view: ItemView): void {
    // 1. Remove tracked elements from WeakMap
    for (const action of this.cardActionEls.get(view) ?? []) {
      action.remove();
    }
    this.cardActionEls.delete(view);

    // 2. Also query and remove any remaining .visual-card-header-action elements inside view.containerEl to prevent duplicates
    view.containerEl.querySelectorAll(".visual-card-header-action").forEach((el) => el.remove());
  }

  private async runForActiveVisualCard(action: (files: VisualCardFiles) => Promise<void>): Promise<void> {
    const files = this.getActiveVisualCard();
    if (!files) {
      new Notice("Visual Card: Visual CardのMarkdownまたは手書き面を開いてから実行してください。");
      return;
    }
    await action(files);
  }

  private resolveVisualCardFromPath(filePath: string): { card: TFile; drawing: TFile | null; drawingPath: string; isDrawing: boolean } | null {
    const normalized = normalizePath(filePath);
    if (normalized.endsWith(".excalidraw.md")) {
      const card = this.app.vault.getMarkdownFiles().find((file) => {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        return frontmatter?.type === "visual-card" && frontmatter.drawing === normalized;
      });
      if (card) {
        const drawing = this.app.vault.getAbstractFileByPath(normalized);
        return { card, drawing: drawing instanceof TFile ? drawing : null, drawingPath: normalized, isDrawing: true };
      }
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile && file.extension === "md") {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.type === "visual-card" && typeof frontmatter.drawing === "string") {
        const drawing = this.app.vault.getAbstractFileByPath(frontmatter.drawing);
        return { card: file, drawing: drawing instanceof TFile ? drawing : null, drawingPath: frontmatter.drawing, isDrawing: false };
      }
    }
    return null;
  }

  private getActiveCanvasView(): ItemView | null {
    const view = this.app.workspace.activeLeaf?.view;
    if (view instanceof ItemView && view.getViewType() === "canvas") {
      return view;
    }
    return null;
  }

  private getSelectedCanvasVisualCards(): CanvasVisualCardTarget[] {
    const view = this.getActiveCanvasView();
    if (!view) return [];
    const canvas = (view as any).canvas;
    if (!canvas) return [];

    const selection: Iterable<any> = canvas.selection ?? [];
    const results: CanvasVisualCardTarget[] = [];

    for (const node of selection) {
      const filePath: string | undefined = node.file?.path ?? (typeof node.filePath === "string" ? node.filePath : (node.unknownData?.file as string | undefined));
      if (!filePath) continue;
      const target = this.resolveVisualCardFromPath(filePath);
      if (target) {
        results.push({
          nodeId: node.id,
          node,
          card: target.card,
          drawing: target.drawing,
          drawingPath: target.drawingPath,
          isDrawing: target.isDrawing,
        });
      }
    }
    return results;
  }

  private setupCanvasMenuHook(): void {
    if (this.canvasMenuObserver) {
      this.canvasMenuObserver.disconnect();
      this.canvasMenuObserver = null;
    }

    const view = this.getActiveCanvasView();
    if (!view) return;

    this.canvasMenuObserver = new MutationObserver(() => {
      this.updateCanvasNodeMenu(view);
    });

    this.canvasMenuObserver.observe(view.contentEl, {
      childList: true,
      subtree: true,
    });

    this.updateCanvasNodeMenu(view);
  }

  private updateCanvasNodeMenu(view: ItemView): void {
    const menuEl = view.contentEl.querySelector(".canvas-menu") as HTMLElement | null;
    if (!menuEl) return;

    const targets = this.getSelectedCanvasVisualCards();
    if (targets.length === 0) {
      menuEl.querySelectorAll(".visual-card-canvas-menu-item").forEach((el) => el.remove());
      return;
    }

    if (menuEl.querySelector(".visual-card-canvas-menu-item")) {
      return;
    }

    // セパレーター
    menuEl.createDiv({ cls: ["canvas-menu-item-separator", "visual-card-canvas-menu-item"] });

    // 1. フリップボタン
    const flipBtn = menuEl.createEl("button", { cls: ["clickable-icon", "canvas-menu-item", "visual-card-canvas-menu-item"] });
    setIcon(flipBtn, FLIP_ICON);
    setTooltip(flipBtn, "Visual Card: 表裏フリップ");
    flipBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.flipSelectedCanvasCards(true);
    });

    // 2. 手書き編集ボタン
    const hwBtn = menuEl.createEl("button", { cls: ["clickable-icon", "canvas-menu-item", "visual-card-canvas-menu-item"] });
    setIcon(hwBtn, PENCIL_SPARKLES_ICON);
    setTooltip(hwBtn, "Visual Card: 手書き面を編集（Excalidraw）");
    hwBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.openCanvasCardHandwriting();
    });

    // 3. テキスト編集ボタン
    const textBtn = menuEl.createEl("button", { cls: ["clickable-icon", "canvas-menu-item", "visual-card-canvas-menu-item"] });
    setIcon(textBtn, "file-type-corner");
    setTooltip(textBtn, "Visual Card: テキスト面を編集（Markdown）");
    textBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.openCanvasCardText();
    });

    // 4. カード複製ボタン
    const copyBtn = menuEl.createEl("button", { cls: ["clickable-icon", "canvas-menu-item", "visual-card-canvas-menu-item"] });
    setIcon(copyBtn, "copy-plus");
    setTooltip(copyBtn, "Visual Card: カードを複製");
    copyBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void this.duplicateSelectedCanvasCards();
    });

    // メニュー幅の増加に伴う中央位置の補正
    this.recenterCanvasMenu(view, menuEl, targets[0]);
  }

  private recenterCanvasMenu(view: ItemView, menuEl: HTMLElement, target: CanvasVisualCardTarget): void {
    const canvas = (view as any).canvas;
    if (!canvas || !target?.node) return;

    window.requestAnimationFrame(() => {
      try {
        const nodeEl = target.node.nodeEl as HTMLElement | undefined;
        if (!nodeEl || !menuEl.isConnected) return;

        const nodeRect = nodeEl.getBoundingClientRect();
        const menuRect = menuEl.getBoundingClientRect();
        if (nodeRect.width === 0 || menuRect.width === 0) return;

        const nodeCenterX = nodeRect.left + nodeRect.width / 2;
        const menuCenterX = menuRect.left + menuRect.width / 2;
        const diffX = nodeCenterX - menuCenterX;

        if (Math.abs(diffX) > 2) {
          const currentLeft = parseFloat(menuEl.style.left) || 0;
          menuEl.style.left = `${currentLeft + diffX}px`;
        }
      } catch (_) {}
    });
  }

  private async flipSelectedCanvasCards(silent = false): Promise<void> {
    const view = this.getActiveCanvasView();
    if (!view) {
      if (!silent) new Notice("Visual Card: Canvasを開いてから実行してください。");
      return;
    }

    const targets = this.getSelectedCanvasVisualCards();
    if (targets.length === 0) {
      if (!silent) new Notice("Visual Card: Canvas上で対象のVisual Cardを選択してください。");
      return;
    }

    const canvasFile = (view as any).file;
    if (!(canvasFile instanceof TFile)) {
      if (!silent) new Notice("Visual Card: Canvasファイルを特定できませんでした。");
      return;
    }

    try {
      await this.app.vault.process(canvasFile, (content) => {
        const data = JSON.parse(content) as Partial<CanvasData>;
        if (!Array.isArray(data.nodes)) return content;
        for (const target of targets) {
          const newPath = target.isDrawing ? target.card.path : target.drawingPath;
          const nodeData = data.nodes.find((n) => n.id === target.nodeId);
          if (nodeData) {
            nodeData.file = newPath;
          }
        }
        return `${JSON.stringify(data, null, "\t")}\n`;
      });

      // Also invoke node-level updates if Canvas supports setFilePath dynamically
      for (const target of targets) {
        const newPath = target.isDrawing ? target.card.path : target.drawingPath;
        if (target.node && typeof target.node.setFilePath === "function") {
          try {
            await target.node.setFilePath(newPath);
          } catch (_) {}
        }
      }

      const canvas = (view as any).canvas;
      if (canvas && typeof canvas.requestSave === "function") {
        try {
          await canvas.requestSave();
        } catch (_) {}
      }
    } catch (error) {
      console.error("Visual Card canvas flip failed", error);
      new Notice(`Visual Card: カードをフリップできませんでした: ${errorMessage(error)}`);
    }
  }

  private async duplicateSelectedCanvasCards(): Promise<void> {
    const view = this.getActiveCanvasView();
    if (!view) {
      new Notice("Visual Card: Canvasを開いてから実行してください。");
      return;
    }

    const targets = this.getSelectedCanvasVisualCards();
    if (targets.length === 0) {
      new Notice("Visual Card: Canvas上で対象のVisual Cardを選択してください。");
      return;
    }

    const canvasFile = (view as any).file;
    if (!(canvasFile instanceof TFile)) {
      new Notice("Visual Card: Canvasファイルを特定できませんでした。");
      return;
    }

    const canvas = (view as any).canvas;
    if (!canvas) return;

    try {
      const newNodes: CanvasNode[] = [];
      const now = new Date();

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const parts = cardNameParts(target.card);
        const title = parts ? parts.title : target.card.basename;

        const targetDate = new Date(now.getTime() + i * 1000);
        const names = await this.getAvailableNames(targetDate, title);

        await this.ensureFolder(this.settings.cardFolder);
        await this.ensureFolder(this.settings.drawingsFolder);

        // Markdown ファイルの複製
        const originalMd = await this.app.vault.read(target.card);
        const updatedMd = originalMd.replace(
          /^drawing:\s*.*$/m,
          `drawing: ${names.drawingCandidatePath}`
        );
        await this.app.vault.create(names.markdownPath, updatedMd);

        // Excalidraw 描画ファイルの複製
        if (target.drawing) {
          const originalDrawing = await this.app.vault.read(target.drawing);
          await this.app.vault.create(names.drawingCandidatePath, originalDrawing);
        } else {
          await this.createDrawing(names.stem, this.settings.drawingsFolder, targetDate);
        }

        // Canvasノードの位置設定（元のノードの少し右下）
        const node = target.node;
        const x = (node?.x ?? 0) + 40;
        const y = (node?.y ?? 0) + 40;
        const width = node?.width ?? 400;
        const height = node?.height ?? 400;

        const newFilePath = target.isDrawing ? names.drawingCandidatePath : names.markdownPath;

        newNodes.push({
          id: nextCanvasNodeId(canvas.data?.nodes ?? []),
          type: "file",
          file: newFilePath,
          x,
          y,
          width,
          height,
        });
      }

      await this.app.vault.process(canvasFile, (content) => {
        const data = JSON.parse(content) as Partial<CanvasData>;
        if (!Array.isArray(data.nodes)) return content;
        data.nodes.push(...newNodes);
        return `${JSON.stringify(data, null, "\t")}\n`;
      });

      if (typeof canvas.requestSave === "function") {
        try {
          await canvas.requestSave();
        } catch (_) {}
      }

      if (typeof canvas.reload === "function") {
        try {
          canvas.reload();
        } catch (_) {}
      }
    } catch (error) {
      console.error("Visual Card duplication failed", error);
      new Notice(`Visual Card: カードの複製に失敗しました: ${errorMessage(error)}`);
    }
  }

  private async openCanvasCardHandwriting(): Promise<void> {
    const targets = this.getSelectedCanvasVisualCards();
    if (targets.length === 0) {
      new Notice("Visual Card: Canvas上で対象のVisual Cardを選択してください。");
      return;
    }
    const target = targets[0];
    if (!target.drawing) {
      new Notice("Visual Card: 手書き面が見つかりません。");
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(target.drawing);
    this.refreshCardHeaderActions();
  }

  private async openCanvasCardText(): Promise<void> {
    const targets = this.getSelectedCanvasVisualCards();
    if (targets.length === 0) {
      new Notice("Visual Card: Canvas上で対象のVisual Cardを選択してください。");
      return;
    }
    const target = targets[0];
    await this.app.workspace.getLeaf(false).openFile(target.card);
    this.refreshCardHeaderActions();
  }

  private async renameCanvasCard(): Promise<void> {
    const targets = this.getSelectedCanvasVisualCards();
    if (targets.length === 0) {
      new Notice("Visual Card: Canvas上で対象のVisual Cardを選択してください。");
      return;
    }
    const target = targets[0];
    await this.renameCardTitle({
      card: target.card,
      drawing: target.drawing,
      drawingPath: target.drawingPath,
    });
  }

  private getActiveVisualCard(): VisualCardFiles | null {
    const activeFile = this.app.workspace.getActiveFile();
    if (!(activeFile instanceof TFile)) return null;
    const activeFrontmatter = this.app.metadataCache.getFileCache(activeFile)?.frontmatter;
    if (activeFrontmatter?.type === "visual-card" && typeof activeFrontmatter.drawing === "string") {
      const drawing = this.app.vault.getAbstractFileByPath(activeFrontmatter.drawing);
      return { card: activeFile, drawing: drawing instanceof TFile ? drawing : null, drawingPath: activeFrontmatter.drawing };
    }

    // The command remains available while the hand-written Excalidraw side is active.
    const card = this.app.vault.getMarkdownFiles().find((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      return frontmatter?.type === "visual-card" && frontmatter.drawing === activeFile.path;
    });
    return card ? { card, drawing: activeFile, drawingPath: activeFile.path } : null;
  }

  private async openHandwriting(files: VisualCardFiles): Promise<void> {
    if (!files.drawing) {
      new Notice("Visual Card: 手書き面が見つかりません。『欠損した手書き面を再作成』を実行してください。");
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(files.drawing);
    this.refreshCardHeaderActions();
  }

  private async openText(files: VisualCardFiles): Promise<void> {
    await this.app.workspace.getLeaf(false).openFile(files.card);
    this.refreshCardHeaderActions();
  }

  private async recreateMissingDrawing(files: VisualCardFiles): Promise<void> {
    if (files.drawing) {
      new Notice("Visual Card: 手書き面はすでに存在します。");
      return;
    }

    const { folder, stem } = drawingLocation(files.drawingPath);
    if (!stem) {
      new Notice("Visual Card: drawing のパス形式が不正なため、手書き面を再作成できません。");
      return;
    }

    try {
      if (folder) await this.ensureFolder(folder);
      const drawingPath = await this.createDrawing(stem, folder, this.getCardDate(files.card));
      await this.app.fileManager.processFrontMatter(files.card, (frontmatter) => {
        frontmatter.drawing = drawingPath;
      });
      const drawing = this.app.vault.getAbstractFileByPath(drawingPath);
      if (!(drawing instanceof TFile)) throw new Error("再作成した手書き面を確認できませんでした");
      new Notice("Visual Card: 手書き面を再作成しました。");
      await this.app.workspace.getLeaf(false).openFile(drawing);
      this.refreshCardHeaderActions();
    } catch (error) {
      console.error("Visual Card drawing recreation failed", error);
      new Notice(`Visual Card: 手書き面を再作成できませんでした: ${errorMessage(error)}`);
    }
  }

  private async addCardToCanvas(files: VisualCardFiles): Promise<void> {
    const side = await promptForCanvasCardSide(this.app, Boolean(files.drawing));
    if (!side) return;
    if (side === "handwriting") {
      await this.addHandwritingToCanvas(files);
      return;
    }
    await this.addFileToCanvas(files.card, "テキスト面");
  }

  private async addHandwritingToCanvas(files: VisualCardFiles): Promise<void> {
    if (!files.drawing) {
      new Notice("Visual Card: 手書き面が見つかりません。先に再作成してください。");
      return;
    }
    await this.addFileToCanvas(files.drawing, "手書き面");
  }

  private async addFileToCanvas(fileToAdd: TFile, label: string): Promise<void> {
    const canvases = this.app.vault.getFiles()
      .filter((file) => file.extension === "canvas")
      .sort((a, b) => a.path.localeCompare(b.path));

    const canvas = await promptForCanvas(
      this.app,
      canvases,
      canvases.length === 0 ? () => this.createCanvasForCard() : undefined,
    );
    if (!canvas) return;

    let alreadyAdded = false;
    try {
      await this.app.vault.process(canvas, (content) => {
        const parsed: unknown = JSON.parse(content);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Canvasの形式が不正です");
        }
        const data = parsed as Partial<CanvasData>;
        if (data.nodes === undefined) data.nodes = [];
        if (data.edges === undefined) data.edges = [];
        if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          throw new Error("Canvasの形式が不正です");
        }
        if (data.nodes.some((node) => node.type === "file" && node.file === fileToAdd.path)) {
          alreadyAdded = true;
          return content;
        }

        const maxBottom = data.nodes.reduce((max, node) => {
          const bottom = Number.isFinite(node.y) && Number.isFinite(node.height) ? node.y + node.height : max;
          return Math.max(max, bottom);
        }, 0);
        data.nodes.push({
          id: nextCanvasNodeId(data.nodes),
          type: "file",
          file: fileToAdd.path,
          x: 0,
          y: maxBottom === 0 ? 0 : maxBottom + 80,
          width: 400,
          height: 300,
        });
        return `${JSON.stringify(data, null, "\t")}\n`;
      });
      new Notice(alreadyAdded
        ? `Visual Card: この${label}はすでにCanvasに追加されています。`
        : `Visual Card: ${canvas.basename} に${label}を追加しました。`);
    } catch (error) {
      console.error("Visual Card Canvas add failed", error);
      new Notice(`Visual Card: Canvasへ追加できませんでした: ${errorMessage(error)}`);
    }
  }

  private async createCanvasForCard(): Promise<TFile | null> {
    const path = this.getAvailableCanvasPath();
    try {
      const canvas = await this.app.vault.create(
        path,
        `${JSON.stringify({ nodes: [], edges: [] }, null, "\t")}\n`,
      );
      new Notice(`Visual Card: Canvasを作成しました: ${canvas.path}`);
      return canvas;
    } catch (error) {
      console.error("Visual Card Canvas creation failed", error);
      new Notice(`Visual Card: Canvasを作成できませんでした: ${errorMessage(error)}`);
      return null;
    }
  }

  private async openContainingCanvas(files: VisualCardFiles): Promise<void> {
    const canvases = await this.findCanvasesContaining(files);
    if (canvases.length === 0) {
      new Notice("Visual Card: このカードが追加されているCanvasはありません。");
      return;
    }
    const canvas = await promptForCanvas(this.app, canvases);
    if (!canvas) return;
    await this.app.workspace.getLeaf(false).openFile(canvas);
  }

  private async findCanvasesContaining(files: VisualCardFiles): Promise<TFile[]> {
    const targetPaths = new Set([files.card.path, files.drawing?.path].filter((path): path is string => Boolean(path)));
    const canvases = this.app.vault.getFiles().filter((file) => file.extension === "canvas");
    const matching: TFile[] = [];
    for (const canvas of canvases) {
      try {
        const data = JSON.parse(await this.app.vault.read(canvas)) as Partial<CanvasData>;
        if (Array.isArray(data.nodes) && data.nodes.some((node) => node.type === "file" && targetPaths.has(node.file ?? ""))) {
          matching.push(canvas);
        }
      } catch (error) {
        console.warn(`Visual Card: Canvasを読み取れませんでした: ${canvas.path}`, error);
      }
    }
    return matching.sort((a, b) => a.path.localeCompare(b.path));
  }

  private async renameCardTitle(files: VisualCardFiles): Promise<void> {
    const name = cardNameParts(files.card);
    if (!name) {
      new Notice("Visual Card: ファイル名が YYMMDD-HHmm-タイトル.md 形式ではないため、カード名を変更できません。");
      return;
    }

    const rawTitle = await promptForRenamedTitle(this.app, name.title);
    if (rawTitle === null) return;
    const title = normalizeTitle(rawTitle);
    const newPath = normalizePath(`${name.folder}${name.folder ? "/" : ""}${name.prefix}-${title}.md`);
    if (newPath === files.card.path) return;
    if (this.app.vault.getAbstractFileByPath(newPath)) {
      new Notice("Visual Card: 同じファイル名がすでにあります。別のカード名を入力してください。");
      return;
    }

    const oldCardPath = files.card.path;
    const oldDrawingPath = files.drawing?.path ?? null;
    const drawingFolder = oldDrawingPath ? drawingLocation(oldDrawingPath).folder : "";
    const newDrawingPath = oldDrawingPath
      ? normalizePath(`${drawingFolder}${drawingFolder ? "/" : ""}${name.prefix}-${title}.excalidraw.md`)
      : null;
    if (newDrawingPath && newDrawingPath !== oldDrawingPath && this.app.vault.getAbstractFileByPath(newDrawingPath)) {
      new Notice("Visual Card: 同じ名前の手書き面がすでにあります。別のカード名を入力してください。");
      return;
    }

    let cardRenamed = false;
    let drawingRenamed = false;
    let frontmatterUpdated = false;
    try {
      await this.app.fileManager.renameFile(files.card, newPath);
      cardRenamed = true;
      if (files.drawing && oldDrawingPath && newDrawingPath && newDrawingPath !== oldDrawingPath) {
        await this.app.fileManager.renameFile(files.drawing, newDrawingPath);
        drawingRenamed = true;
        await this.app.fileManager.processFrontMatter(files.card, (frontmatter) => {
          frontmatter.drawing = newDrawingPath;
        });
        frontmatterUpdated = true;
        await this.updateCanvasFileReferences(oldDrawingPath, newDrawingPath);
      }
      new Notice(`Visual Card: カード名を「${title}」へ変更しました。`);
      window.setTimeout(() => this.refreshCardHeaderActions(), 0);
    } catch (error) {
      console.error("Visual Card card rename failed", error);
      try {
        if (frontmatterUpdated && cardRenamed && oldDrawingPath) {
          await this.app.fileManager.processFrontMatter(files.card, (frontmatter) => {
            frontmatter.drawing = oldDrawingPath;
          });
        }
        if (drawingRenamed && files.drawing && oldDrawingPath) await this.app.fileManager.renameFile(files.drawing, oldDrawingPath);
        if (cardRenamed) await this.app.fileManager.renameFile(files.card, oldCardPath);
      } catch (rollbackError) {
        console.error("Visual Card card rename rollback failed", rollbackError);
      }
      new Notice(`Visual Card: カード名を変更できませんでした: ${errorMessage(error)}`);
    }
  }

  private async updateCanvasFileReferences(oldPath: string, newPath: string): Promise<void> {
    const canvases = this.app.vault.getFiles().filter((file) => file.extension === "canvas");
    for (const canvas of canvases) {
      try {
        await this.app.vault.process(canvas, (content) => {
          const data = JSON.parse(content) as Partial<CanvasData>;
          if (!Array.isArray(data.nodes) || !data.nodes.some((node) => node.type === "file" && node.file === oldPath)) return content;
          for (const node of data.nodes) {
            if (node.type === "file" && node.file === oldPath) node.file = newPath;
          }
          return `${JSON.stringify(data, null, "\t")}\n`;
        });
      } catch (error) {
        console.warn(`Visual Card: Canvas参照を更新できませんでした: ${canvas.path}`, error);
      }
    }
  }

  private async createVisualCard(rawTitle: string): Promise<void> {
    const now = new Date();
    const title = normalizeTitle(rawTitle);
    const names = await this.getAvailableNames(now, title);
    let markdownFile: TFile | null = null;
    let drawingPath: string | null = null;

    try {
      await this.ensureFolder(this.settings.cardFolder);
      await this.ensureFolder(this.settings.drawingsFolder);

      markdownFile = await this.app.vault.create(
        names.markdownPath,
        createCardMarkdown(title, now, names.drawingCandidatePath),
      );

      drawingPath = await this.createDrawing(names.stem, this.settings.drawingsFolder, now);

      await this.app.fileManager.processFrontMatter(markdownFile, (frontmatter) => {
        frontmatter.drawing = drawingPath;
      });

      new Notice(`Visual Card を作成しました: ${names.stem}`);
      window.setTimeout(() => this.refreshCardHeaderActions(), 0);
    } catch (error) {
      if (markdownFile) {
        try {
          await this.app.vault.delete(markdownFile);
        } catch (rollbackError) {
          console.error("Visual Card: markdown rollback failed", rollbackError);
        }
      }
      if (drawingPath) {
        const drawingFile = this.app.vault.getAbstractFileByPath(drawingPath);
        if (drawingFile instanceof TFile) {
          try {
            await this.app.vault.delete(drawingFile);
          } catch (rollbackError) {
            console.error("Visual Card: drawing rollback failed", rollbackError);
          }
        }
      }
      console.error("Visual Card creation failed", error);
      new Notice(`Visual Card を作成できませんでした: ${errorMessage(error)}`);
    }
  }

  private async promptAndCreateVisualCard(): Promise<void> {
    const title = await promptForTitle(this.app);
    if (title === null) return;
    await this.createVisualCard(title);
  }

  private async getAvailableNames(now: Date, title: string): Promise<CardNames> {
    const baseStem = `${formatShortTimestamp(now)}-${title}`;
    for (let suffix = 1; ; suffix += 1) {
      const stem = suffix === 1 ? baseStem : `${baseStem}-${suffix}`;
      const markdownPath = normalizePath(`${this.settings.cardFolder}/${stem}.md`);
      const drawingCandidatePath = normalizePath(`${this.settings.drawingsFolder}/${stem}.excalidraw.md`);
      if (!this.app.vault.getAbstractFileByPath(markdownPath) && !this.app.vault.getAbstractFileByPath(drawingCandidatePath)) {
        return { stem, markdownPath, drawingCandidatePath };
      }
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    const existing: TAbstractFile | null = this.app.vault.getAbstractFileByPath(path);
    if (!existing) {
      await this.app.vault.createFolder(path);
      return;
    }
    if (!("children" in existing)) throw new Error(`${path} はフォルダではありません`);
  }

  private getAvailableCanvasPath(): string {
    const baseName = "新規キャンバス";
    for (let suffix = 1; ; suffix += 1) {
      const name = suffix === 1 ? baseName : `${baseName} ${suffix}`;
      const path = `${name}.canvas`;
      if (!this.app.vault.getAbstractFileByPath(path)) return path;
    }
  }

  private async createDrawing(stem: string, folder: string, date: Date): Promise<string> {
    const ea = getExcalidrawAutomate();
    if (!ea) throw new Error("Excalidraw プラグインが見つかりません。導入・有効化してから再試行してください。");

    // Excalidraw Automate is the documented public API for creating a drawing.
    // The frame is a visual boundary; Excalidraw itself remains an infinite canvas.
    ea.reset();
    ea.style.strokeColor = this.settings.penColor;
    ea.style.backgroundColor = "transparent";
    ea.style.fillStyle = "solid";
    ea.style.strokeWidth = this.settings.penWidth;
    ea.style.roughness = 0;
    ea.style.opacity = this.settings.penOpacity;
    const frameId = ea.addFrame(0, 0, this.settings.frameWidth, Math.round(this.settings.frameWidth * 3 / 4));
    ea.setFontFamily(this.settings.dateFontFamily);
    ea.style.fontSize = this.settings.dateFontSize;
    const dateId = ea.addText(32, 28, formatCardDate(date));
    ea.addElementsToFrame(frameId, [dateId]);
    return ea.create({
      filename: stem,
      foldername: folder,
      templatePath: null,
      onNewPane: false,
      frontmatterKeys: { "excalidraw-plugin": "parsed" },
    });
  }

  private getCardDate(card: TFile): Date {
    const date = this.app.metadataCache.getFileCache(card)?.frontmatter?.date;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-").map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date();
  }

  private handleVaultModify(file: TAbstractFile): void {
    if (!(file instanceof TFile) || this.isTimestampWrite(file.path)) return;
    const card = this.getCardForModifiedFile(file);
    if (!card) return;

    const existingTimer = this.timestampTimers.get(card.path);
    if (existingTimer) window.clearTimeout(existingTimer);
    const timer = window.setTimeout(() => {
      this.timestampTimers.delete(card.path);
      void this.updateCardTimestamp(card);
    }, 400);
    this.timestampTimers.set(card.path, timer);
  }

  private getCardForModifiedFile(file: TFile): TFile | null {
    const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (frontmatter?.type === "visual-card") return file;
    return this.app.vault.getMarkdownFiles().find((card) => {
      const cardFrontmatter = this.app.metadataCache.getFileCache(card)?.frontmatter;
      return cardFrontmatter?.type === "visual-card" && cardFrontmatter.drawing === file.path;
    }) ?? null;
  }

  private isTimestampWrite(path: string): boolean {
    const writtenAt = this.timestampWrites.get(path);
    if (!writtenAt) return false;
    if (Date.now() - writtenAt < 2000) return true;
    this.timestampWrites.delete(path);
    return false;
  }

  private async updateCardTimestamp(card: TFile): Promise<void> {
    this.timestampWrites.set(card.path, Date.now());
    try {
      await this.app.fileManager.processFrontMatter(card, (frontmatter) => {
        if (frontmatter.type === "visual-card") frontmatter.updated = formatLocalIso(new Date());
      });
    } catch (error) {
      console.error("Visual Card timestamp update failed", error);
    }
  }

  private async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class VisualCardSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: VisualCardPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl("h2", { text: "Visual Card" });

    new Setting(this.containerEl)
      .setName("カード保存フォルダ")
      .setDesc("Markdownカードの保存先。既定値: VisualCards")
      .addText((text) => text
        .setValue(this.plugin.settings.cardFolder)
        .onChange(async (value) => {
          this.plugin.settings.cardFolder = normalizedFolder(value, DEFAULT_SETTINGS.cardFolder);
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("描画保存フォルダ")
      .setDesc("対応するExcalidrawファイルの保存先。既定値: VisualCards/drawings")
      .addText((text) => text
        .setValue(this.plugin.settings.drawingsFolder)
        .onChange(async (value) => {
          this.plugin.settings.drawingsFolder = normalizedFolder(value, DEFAULT_SETTINGS.drawingsFolder);
          await this.plugin.saveSettings();
        }));

    this.containerEl.createEl("h3", { text: "カード枠" });

    new Setting(this.containerEl)
      .setName("枠線の色")
      .setDesc("CSSカラー値。例: #000000")
      .addText((text) => text
        .setValue(this.plugin.settings.penColor)
        .onChange(async (value) => {
          this.plugin.settings.penColor = value.trim() || DEFAULT_SETTINGS.penColor;
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("枠線の太さ")
      .addDropdown((dropdown) => dropdown
        .addOptions({ "1": "細め", "2": "標準", "4": "太め" })
        .setValue(String(this.plugin.settings.penWidth))
        .onChange(async (value) => {
          this.plugin.settings.penWidth = Number(value);
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("枠線の不透明度")
      .addDropdown((dropdown) => dropdown
        .addOptions({ "100": "100%", "75": "75%", "50": "50%" })
        .setValue(String(this.plugin.settings.penOpacity))
        .onChange(async (value) => {
          this.plugin.settings.penOpacity = Number(value);
          await this.plugin.saveSettings();
        }));

    this.containerEl.createEl("h3", { text: "日付とカード枠" });

    new Setting(this.containerEl)
      .setName("日付フォント")
      .addDropdown((dropdown) => dropdown
        .addOptions({ "1": "Virgil", "2": "Helvetica", "3": "Cascadia" })
        .setValue(String(this.plugin.settings.dateFontFamily))
        .onChange(async (value) => {
          this.plugin.settings.dateFontFamily = Number(value);
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("日付フォントサイズ")
      .setDesc("8〜48。既定値: 18")
      .addText((text) => text
        .setValue(String(this.plugin.settings.dateFontSize))
        .onChange(async (value) => {
          this.plugin.settings.dateFontSize = boundedNumber(value, 8, 48, DEFAULT_SETTINGS.dateFontSize);
          await this.plugin.saveSettings();
        }));

    new Setting(this.containerEl)
      .setName("カード枠の基準幅")
      .setDesc("高さは4:3比率で自動計算されます。既定値: 1200")
      .addText((text) => text
        .setValue(String(this.plugin.settings.frameWidth))
        .onChange(async (value) => {
          this.plugin.settings.frameWidth = boundedNumber(value, 400, 2400, DEFAULT_SETTINGS.frameWidth);
          await this.plugin.saveSettings();
        }));
  }
}

class CardTitleModal extends Modal {
  private value = "";
  private settled = false;
  private resolver: (value: string | null) => void;

  constructor(app: App, resolver: (value: string | null) => void) {
    super(app);
    this.resolver = resolver;
  }

  onOpen(): void {
    this.titleEl.setText("新しいVisual Card");
    const input = this.contentEl.createEl("input", { type: "text", placeholder: "タイトル（空欄は無題）" });
    input.addClass("visual-card-title-input");
    input.addEventListener("input", () => { this.value = input.value; });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.submit();
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "キャンセル" });
    cancel.addEventListener("click", () => { this.resolve(null); this.close(); });
    const create = actions.createEl("button", { text: "作成", cls: "mod-cta" });
    create.addEventListener("click", () => this.submit());
    window.setTimeout(() => input.focus(), 0);
  }

  onClose(): void {
    if (!this.settled) this.resolve(null);
    this.contentEl.empty();
  }

  private submit(): void {
    this.resolve(this.value);
    this.close();
  }

  private resolve(value: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolver(value);
  }
}

class RenameCardTitleModal extends Modal {
  private value: string;
  private settled = false;
  private resolver: (value: string | null) => void;

  constructor(app: App, initialTitle: string, resolver: (value: string | null) => void) {
    super(app);
    this.value = initialTitle;
    this.resolver = resolver;
  }

  onOpen(): void {
    this.titleEl.setText("Visual Cardの名前を変更");
    this.contentEl.createEl("p", { text: "日時部分はそのままにして、後ろのカード名だけを変更します。" });
    const input = this.contentEl.createEl("input", { type: "text", value: this.value, placeholder: "カード名（空欄は無題）" });
    input.addClass("visual-card-title-input");
    input.addEventListener("input", () => { this.value = input.value; });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.submit();
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const cancel = actions.createEl("button", { text: "キャンセル" });
    cancel.addEventListener("click", () => { this.resolve(null); this.close(); });
    const save = actions.createEl("button", { text: "変更", cls: "mod-cta" });
    save.addEventListener("click", () => this.submit());
    window.setTimeout(() => { input.focus(); input.select(); }, 0);
  }

  onClose(): void {
    if (!this.settled) this.resolve(null);
    this.contentEl.empty();
  }

  private submit(): void {
    this.resolve(this.value);
    this.close();
  }

  private resolve(value: string | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolver(value);
  }
}

class CanvasPickerModal extends Modal {
  private settled = false;
  private resolver: (canvas: TFile | null) => void;

  constructor(
    app: App,
    private canvases: TFile[],
    resolver: (canvas: TFile | null) => void,
    private onCreate: (() => Promise<TFile | null>) | undefined,
  ) {
    super(app);
    this.resolver = resolver;
  }

  onOpen(): void {
    this.titleEl.setText("Canvasを選択");
    if (this.canvases.length > 0) {
      this.contentEl.createEl("p", { text: "追加先または開くCanvasを選んでください。" });
      const list = this.contentEl.createDiv({ cls: "visual-card-canvas-list" });
      for (const canvas of this.canvases) {
        const button = list.createEl("button", { text: canvas.path, cls: "visual-card-canvas-button" });
        button.addEventListener("click", () => { this.resolve(canvas); this.close(); });
      }
    } else {
      this.contentEl.createEl("p", { text: "追加先のCanvasがありません。新しく作成してください。" });
    }
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    if (this.canvases.length === 0 && this.onCreate) {
      const create = actions.createEl("button", { text: "新規キャンバスを作成", cls: "mod-cta" });
      create.addEventListener("click", async () => {
        create.disabled = true;
        const canvas = await this.onCreate?.();
        this.resolve(canvas ?? null);
        this.close();
      });
    }
    const cancel = actions.createEl("button", { text: "キャンセル" });
    cancel.addEventListener("click", () => { this.resolve(null); this.close(); });
  }

  onClose(): void {
    this.resolve(null);
    this.contentEl.empty();
  }

  private resolve(canvas: TFile | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolver(canvas);
  }
}

class CanvasCardSideModal extends Modal {
  private settled = false;
  private resolver: (side: CanvasCardSide | null) => void;

  constructor(app: App, private hasDrawing: boolean, resolver: (side: CanvasCardSide | null) => void) {
    super(app);
    this.resolver = resolver;
  }

  onOpen(): void {
    this.titleEl.setText("Canvasへ追加する面を選択");
    this.contentEl.createEl("p", { text: "Canvasにはどちらの面を追加しますか？" });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    const handwriting = actions.createEl("button", { text: "✒️ 手書き面", cls: "mod-cta" });
    handwriting.disabled = !this.hasDrawing;
    handwriting.addEventListener("click", () => { this.resolve("handwriting"); this.close(); });
    const text = actions.createEl("button", { text: "テキスト面" });
    text.addEventListener("click", () => { this.resolve("text"); this.close(); });
  }

  onClose(): void {
    this.resolve(null);
    this.contentEl.empty();
  }

  private resolve(side: CanvasCardSide | null): void {
    if (this.settled) return;
    this.settled = true;
    this.resolver(side);
  }
}

function promptForTitle(app: App): Promise<string | null> {
  return new Promise((resolve) => new CardTitleModal(app, resolve).open());
}

function promptForRenamedTitle(app: App, initialTitle: string): Promise<string | null> {
  return new Promise((resolve) => new RenameCardTitleModal(app, initialTitle, resolve).open());
}

function promptForCanvas(
  app: App,
  canvases: TFile[],
  onCreate?: () => Promise<TFile | null>,
): Promise<TFile | null> {
  return new Promise((resolve) => new CanvasPickerModal(app, canvases, resolve, onCreate).open());
}

function promptForCanvasCardSide(app: App, hasDrawing: boolean): Promise<CanvasCardSide | null> {
  return new Promise((resolve) => new CanvasCardSideModal(app, hasDrawing, resolve).open());
}

function normalizeTitle(value: string): string {
  const normalized = value
    .trim()
    .replace(/[\\/:*?"<>|#^[\]`]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || UNTITLED;
}

function cardNameParts(file: TFile): { folder: string; prefix: string; title: string } | null {
  const match = /^(\d{6}-\d{4})-(.+)$/.exec(file.basename);
  if (!match) return null;
  const separator = file.path.lastIndexOf("/");
  return {
    folder: separator >= 0 ? file.path.slice(0, separator) : "",
    prefix: match[1],
    title: match[2],
  };
}

function normalizedFolder(value: string, fallback: string): string {
  const normalized = normalizePath(value.trim().replace(/^\/+|\/+$/g, ""));
  return normalized && normalized !== "." ? normalized : fallback;
}

function boundedNumber(value: string, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : fallback;
}

function drawingLocation(path: string): { folder: string; stem: string } {
  const normalized = normalizePath(path);
  const separator = normalized.lastIndexOf("/");
  const folder = separator >= 0 ? normalized.slice(0, separator) : "";
  const filename = separator >= 0 ? normalized.slice(separator + 1) : normalized;
  return filename.endsWith(".excalidraw.md")
    ? { folder, stem: filename.slice(0, -".excalidraw.md".length) }
    : { folder, stem: "" };
}

function nextCanvasNodeId(nodes: CanvasNode[]): string {
  const existingIds = new Set(nodes.map((node) => node.id));
  let id = "";
  do {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } while (existingIds.has(id));
  return id;
}

function formatShortTimestamp(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  return `${yy}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function formatCardDate(date: Date): string {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function formatLocalIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}

function createCardMarkdown(title: string, date: Date, drawingPath: string): string {
  const created = formatLocalIso(date);
  return `---\ntype: visual-card\ndate: ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}\ncreated: ${created}\nupdated: ${created}\ndrawing: ${drawingPath}\n---\n\n# ${title}\n`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

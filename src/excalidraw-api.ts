/**
 * The public Excalidraw Automate surface used by this phase.
 * Keep this deliberately small: it is a runtime dependency supplied by
 * Excalidraw, not an import from its private implementation.
 */
export interface ExcalidrawAutomateApi {
  reset(): void;
  setFontFamily(value: number): string;
  addFrame(topX: number, topY: number, width: number, height: number, name?: string): string;
  addElementsToFrame(frameId: string, elementIds: string[]): void;
  addRect(topX: number, topY: number, width: number, height: number): string;
  addText(topX: number, topY: number, text: string): string;
  create(params: {
    filename: string;
    foldername: string;
    templatePath: string | null;
    onNewPane: boolean;
    frontmatterKeys?: Record<string, string | boolean>;
  }): Promise<string>;
  style: {
    strokeColor: string;
    backgroundColor: string;
    fillStyle: "hachure" | "cross-hatch" | "solid";
    strokeWidth: number;
    roughness: number;
    opacity: number;
    fontFamily: number;
    fontSize: number;
  };
}

declare global {
  interface Window {
    ExcalidrawAutomate?: ExcalidrawAutomateApi;
  }
}

export function getExcalidrawAutomate(): ExcalidrawAutomateApi | null {
  return window.ExcalidrawAutomate ?? null;
}

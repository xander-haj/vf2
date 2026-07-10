/** Starts the editor only when loaded through its authenticated local Vite bridge. */

import "./editor.css";
import { EditorApp } from "./editor-app";

const fatal = document.getElementById("editor-fatal");
const fatalMessage = document.getElementById("editor-fatal-message");

function showFatal(error: unknown): void {
  if (fatal !== null) fatal.hidden = false;
  if (fatalMessage !== null) {
    fatalMessage.textContent = error instanceof Error ? error.message : "The editor could not start.";
  }
  const diagnostic = error instanceof Error ? error.message : "Unknown initialization error";
  console.error(`[VoxelFrontierEditor] Initialization failed: ${diagnostic}`);
}

let editor: EditorApp | null = null;
try {
  editor = new EditorApp();
  void editor.start().catch(showFatal);
} catch (error: unknown) {
  showFatal(error);
}

window.addEventListener("beforeunload", () => editor?.dispose(), { once: true });

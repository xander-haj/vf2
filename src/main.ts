/**
 * Browser entry point for Voxel Frontier.
 * It validates required markup, starts the game, and converts initialization failures into safe UI messages.
 */

import "./styles.css";
import { Game } from "./game/game";

/** Retrieves the required rendering canvas before expensive game systems are constructed. */
function getGameCanvas(): HTMLCanvasElement {
  const canvas = document.getElementById("game-canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("The game canvas is missing or has the wrong element type.");
  }
  return canvas;
}

/** Replaces the pause menu with a concise startup failure that does not expose internal stack data. */
function showStartupError(error: unknown): void {
  const errorScreen = document.getElementById("error-screen");
  const errorMessage = document.getElementById("error-message");
  if (errorScreen !== null) {
    errorScreen.classList.add("visible");
  }
  if (errorMessage !== null) {
    errorMessage.textContent = error instanceof Error
      ? error.message
      : "The game could not initialize in this browser.";
  }
  const diagnostic = error instanceof Error ? error.message : "Unknown initialization error";
  console.error(`[VoxelFrontier] Startup failed: ${diagnostic}`);
}

let game: Game | null = null;

try {
  game = new Game(getGameCanvas());
  game.start();
} catch (error: unknown) {
  showStartupError(error);
}

/** Releases browser and GPU resources during navigation without mutating saved world data. */
function disposeGame(): void {
  game?.dispose();
}

window.addEventListener("beforeunload", disposeGame, { once: true });


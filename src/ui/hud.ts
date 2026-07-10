/**
 * Owns all accessible HTML interface state layered over the Three.js canvas.
 * Rendering stays separate from DOM updates so simulation systems remain browser-UI agnostic.
 */

import {
  HOTBAR_BLOCKS,
  getBlockDefinition,
} from "../game/block-types";

/** Retrieves a required DOM element and fails early with a clear initialization error. */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Required interface element #${id} is missing.`);
  }
  return element as T;
}

/** Hud maintains menus, status text, and the visual hotbar selection. */
export class Hud {
  private readonly pauseScreen = requireElement<HTMLElement>("pause-screen");
  private readonly pauseMessage = requireElement<HTMLElement>("pause-message");
  private readonly playButton = requireElement<HTMLButtonElement>("play-button");
  private readonly hotbar = requireElement<HTMLElement>("hotbar");
  private readonly targetLabel = requireElement<HTMLElement>("target-label");
  private readonly slots: HTMLButtonElement[] = [];
  private selectedBlockName = "Grass";
  private persistenceUnavailable = false;

  public constructor(
    onPlay: () => void,
    onSelectBlock: (index: number) => void,
    private readonly mobileMode: boolean,
  ) {
    this.playButton.addEventListener("click", onPlay);
    this.buildHotbar(onSelectBlock);
  }

  /** Creates one keyboard-accessible button for every placeable block. */
  private buildHotbar(onSelectBlock: (index: number) => void): void {
    HOTBAR_BLOCKS.forEach((blockId, index) => {
      const definition = getBlockDefinition(blockId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hotbar-slot";
      button.setAttribute("aria-label", `${index + 1}: ${definition.name}`);
      button.style.setProperty("--block-color", definition.uiColor);
      button.innerHTML = `<span class="slot-number">${index + 1}</span><span class="block-swatch"></span>`;
      button.addEventListener("click", () => onSelectBlock(index));
      this.hotbar.append(button);
      this.slots.push(button);
    });
  }

  /** Highlights the active slot and exposes its block name beside the crosshair. */
  public setSelectedIndex(index: number): void {
    this.slots.forEach((slot, slotIndex) => {
      const selected = slotIndex === index;
      slot.classList.toggle("selected", selected);
      slot.setAttribute("aria-pressed", String(selected));
    });
    const blockId = HOTBAR_BLOCKS[index];
    if (blockId !== undefined) {
      this.selectedBlockName = getBlockDefinition(blockId).name;
      this.updateTargetLabel();
    }
  }

  /** Combines active material and save health so neither piece of essential status hides the other. */
  private updateTargetLabel(): void {
    this.targetLabel.textContent = this.persistenceUnavailable
      ? `${this.selectedBlockName} · changes not saved`
      : this.selectedBlockName;
    this.targetLabel.classList.toggle("warning", this.persistenceUnavailable);
  }

  /** Shows or hides the pause menu and updates its call to action for first entry versus resume. */
  public setPaused(paused: boolean, hasEnteredWorld: boolean): void {
    this.pauseScreen.classList.toggle("visible", paused);
    this.pauseScreen.setAttribute("aria-hidden", String(!paused));
    const entryVerb = this.mobileMode ? "Tap" : "Click";
    this.pauseMessage.textContent = hasEnteredWorld ? "World paused" : `${entryVerb} to enter the world`;
    this.playButton.textContent = hasEnteredWorld ? "Resume" : "Enter world";
  }

  /** Displays a persistent save warning without blocking continued in-memory play. */
  public showPersistenceWarning(): void {
    this.persistenceUnavailable = true;
    this.updateTargetLabel();
  }
}

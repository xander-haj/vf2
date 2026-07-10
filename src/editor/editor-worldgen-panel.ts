/** Supplies generation-specific controls while keeping canonical fields visible in the generic inspector. */

// Production generator contracts and editor state are combined only for read-only preview and command creation.
import type { EditorCommandStack } from "./editor-command-stack";
import { EngineWorldGenerator } from "../engine/worldgen/engine-world-generator";
import { getBlockDefinition } from "../game/block-types";
import { ENGINE_WORLDGEN_PROFILE } from "../generated/engine-worldgen-registry";
import type { EditorSelection, EditorState, JsonObject, JsonValue } from "./editor-state";
import { compileEditorWorldgen } from "./editor-worldgen-compiler";
import type { EditorViewport } from "./editor-viewport";
import { verifyEngineWorldgen } from "../engine/worldgen/worldgen-verification";

/** Narrows selected data before world-profile fields are inspected. */
function isObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Changes only an existing persisted generation stream so the compiler schema remains authoritative. */
function replaceTerrainStream(value: JsonValue, seed: number): JsonValue | null {
  const copy = structuredClone(value);
  if (isObject(copy)) {
    if (isObject(copy.streams) && typeof copy.streams.terrain === "number") {
      copy.streams.terrain = seed;
      return copy;
    }
    for (const key of ["seed", "salt"]) {
      if (typeof copy[key] === "number") {
        copy[key] = seed;
        return copy;
      }
    }
  }
  return null;
}

/** Reads the persisted terrain salt for accurate control initialization. */
function terrainStream(value: JsonValue): number {
  if (!isObject(value)) return 1;
  if (isObject(value.streams) && typeof value.streams.terrain === "number") return value.streams.terrain;
  if (typeof value.seed === "number") return value.seed;
  if (typeof value.salt === "number") return value.salt;
  return 1;
}

export class EditorWorldgenPanel {
  private coordinate = { x: 8, y: 48, z: 8 };

  /** Adds deterministic terrain-stream tools or biome guidance for generation-related selections. */
  render(
    container: HTMLElement,
    selection: EditorSelection,
    value: JsonValue,
    commands: EditorCommandStack,
    state: EditorState,
    viewport: EditorViewport,
  ): boolean {
    if (selection.kind !== "worldgen" && selection.kind !== "biome") return false;
    const card = document.createElement("section");
    card.className = "context-card";
    const title = document.createElement("h3");
    title.textContent = selection.kind === "biome" ? "Build this biome" : "Build this world";
    const description = document.createElement("p");
    const ownsSalt = isObject(value) && typeof value.salt === "number";
    description.textContent = selection.kind === "biome"
      ? "Change its weather ranges and ground layers while the picture updates."
      : ownsSalt
        ? "This special number changes only this world feature."
        : "This special number changes the land shape for every matching seed.";
    card.append(title, description);
    if (isObject(value) && (value.id === "vf:legacy_v1" || value.generatorVersion === 1)) {
      description.textContent = "This old-world recipe is protected so saved worlds never change shape.";
      container.append(card);
      return true;
    }
    const actions = document.createElement("div");
    actions.className = "context-actions";
    const seedInput = document.createElement("input");
    seedInput.type = "number";
    seedInput.step = "1";
    seedInput.value = String(state.previewSeed);
    seedInput.setAttribute("aria-label", "Preview world seed");
    seedInput.title = "Set the temporary world seed used only by editor previews and diagnostics.";
    const applySeed = document.createElement("button");
    applySeed.type = "button";
    applySeed.textContent = "Try this seed";
    applySeed.title = "Regenerate the preview with this seed without changing canonical content.";
    applySeed.addEventListener("click", () => state.setPreviewSeed(Number(seedInput.value)));
    actions.append(seedInput, applySeed);
    if (selection.kind !== "biome") {
      this.addTerrainSaltControls(actions, selection, value, commands, ownsSalt ? "Feature salt" : "Terrain salt");
    }
    card.append(actions, this.createExplanationControls(state, viewport));
    container.append(card);
    return true;
  }

  /** Adds persisted terrain stream controls that change the real EngineWorldGenerator random field. */
  private addTerrainSaltControls(
    actions: HTMLElement,
    selection: EditorSelection,
    value: JsonValue,
    commands: EditorCommandStack,
    label: string,
  ): void {
    const seedInput = document.createElement("input");
    seedInput.type = "number";
    seedInput.step = "1";
    seedInput.value = String(terrainStream(value));
    seedInput.setAttribute("aria-label", label);
    seedInput.title = `Edit the persisted ${label.toLowerCase()} that isolates this generation random stream.`;
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = `Apply ${label.toLowerCase()}`;
    apply.title = `Apply this ${label.toLowerCase()} as a reversible canonical content change.`;
    apply.addEventListener("click", () => {
      const seed = Number(seedInput.value);
      if (!Number.isSafeInteger(seed)) return;
      const next = replaceTerrainStream(value, seed);
      if (next !== null) commands.execute(selection.file, selection.pointer, next, `Change ${label.toLowerCase()}`);
    });
    const randomize = document.createElement("button");
    randomize.type = "button";
    randomize.textContent = "Randomize";
    randomize.title = `Generate and apply a cryptographically random ${label.toLowerCase()}.`;
    randomize.addEventListener("click", () => {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const seed = random[0] ?? 0;
      seedInput.value = String(seed);
      const next = replaceTerrainStream(value, seed);
      if (next !== null) commands.execute(selection.file, selection.pointer, next, `Randomize ${label.toLowerCase()}`);
    });
    actions.append(seedInput, apply, randomize);
  }

  /** Builds coordinate diagnostics and same-seed comparison controls backed by production pass explanations. */
  private createExplanationControls(state: EditorState, viewport: EditorViewport): HTMLElement {
    const section = document.createElement("section");
    const coordinates = document.createElement("div");
    coordinates.className = "context-actions";
    const inputs = (["x", "y", "z"] as const).map((axis) => {
      const input = document.createElement("input");
      input.type = "number";
      input.step = "1";
      input.value = String(this.coordinate[axis]);
      input.setAttribute("aria-label", `Explain coordinate ${axis.toUpperCase()}`);
      input.title = `Set the world ${axis.toUpperCase()} coordinate used by generation pass diagnostics.`;
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (Number.isInteger(value)) this.coordinate[axis] = value;
      });
      return input;
    });
    const explain = document.createElement("button");
    explain.type = "button";
    explain.textContent = "Show why";
    explain.title = "Replay production generation and show why the selected coordinate became its final block.";
    const compare = document.createElement("button");
    compare.type = "button";
    compare.textContent = "Compare before";
    compare.title = "Render unsaved and last-generated profiles side by side with the same preview seed.";
    const verify = document.createElement("button");
    verify.type = "button";
    verify.textContent = "Run world checks";
    verify.title = "Run golden-coordinate, chunk-order, and pass-replay checks in the production generator.";
    const output = document.createElement("pre");
    output.className = "generation-explanation";
    explain.addEventListener("click", () => this.explain(state, output, false));
    compare.addEventListener("click", () => {
      try {
        viewport.showWorldgenComparison();
        this.explain(state, output, true);
      } catch (error: unknown) {
        output.textContent = error instanceof Error ? error.message : "Profile comparison failed.";
      }
    });
    verify.addEventListener("click", () => {
      const result = verifyEngineWorldgen();
      output.textContent = result.passed
        ? "Golden coordinates, chunk order, and pass replay all verified."
        : result.diagnostics.join("\n");
    });
    coordinates.append(...inputs, explain, compare, verify);
    section.append(coordinates, output);
    return section;
  }

  /** Replays exact ordered passes for the unsaved profile and optionally its saved generated baseline. */
  private explain(state: EditorState, output: HTMLElement, compare: boolean): void {
    try {
      const compiled = compileEditorWorldgen(state.snapshot());
      const current = new EngineWorldGenerator(
        state.previewSeed,
        compiled.profile,
        compiled.dimensions.chunkSize,
        compiled.dimensions.worldHeight,
        compiled.dimensions.sectionHeight,
      ).explainCoordinate(this.coordinate.x, this.coordinate.y, this.coordinate.z);
      const lines = [
        `Current · biome ${current.biomeId} · surface ${current.surfaceHeight}`,
        `climate: continental ${current.climate.continentalness.toFixed(3)}, ` +
          `erosion ${current.climate.erosion.toFixed(3)}, temperature ${current.climate.temperature.toFixed(3)}, ` +
          `humidity ${current.climate.humidity.toFixed(3)}, weirdness ${current.climate.weirdness.toFixed(3)}`,
        `density: ${current.density.toFixed(4)} · base ${current.densityBaseHeight} · ` +
          `cave carved ${String(current.caveCarved)}`,
        ...current.passes.map((pass) => `${pass.pass}: ${getBlockDefinition(pass.block).name}`),
      ];
      if (compare) {
        const saved = new EngineWorldGenerator(
          state.previewSeed,
          ENGINE_WORLDGEN_PROFILE,
          compiled.dimensions.chunkSize,
          compiled.dimensions.worldHeight,
          compiled.dimensions.sectionHeight,
        ).explainCoordinate(this.coordinate.x, this.coordinate.y, this.coordinate.z);
        lines.push(
          `Saved · biome ${saved.biomeId} · surface ${saved.surfaceHeight}`,
          `density: ${saved.density.toFixed(4)} · base ${saved.densityBaseHeight} · ` +
            `cave carved ${String(saved.caveCarved)}`,
          ...saved.passes.map((pass) => `${pass.pass}: ${getBlockDefinition(pass.block).name}`),
        );
      }
      output.textContent = lines.join("\n");
    } catch (error: unknown) {
      output.textContent = error instanceof Error ? error.message : "Coordinate explanation failed.";
    }
  }
}

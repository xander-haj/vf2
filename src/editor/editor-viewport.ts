/** Renders selected content with the same Three.js and procedural atlas stack used by the game. */

// Three.js production rendering primitives provide an isolated preview scene with explicit GPU ownership.
import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
// Game rendering and isolated editor test adapters share one explicitly owned preview scene.
import { createTextureAtlas, type TextureAtlas } from "../game/texture-atlas";
import { TEXTURE_NAMES, type TextureName } from "../game/block-model";
import type { EditorState, JsonObject, JsonValue } from "./editor-state";
import { createEditorTexture } from "./editor-texture-preview";
import { EditorEntityTestScene } from "./editor-entity-test-scene";
import type { EntityDebugSnapshot } from "../engine/entities/entity-debug";
import { createEditorTerrainPreview } from "./editor-terrain-preview";
import { createEditorWorldObjectPreview } from "./editor-world-object-preview";
import { isGraphicalKind } from "./editor-content-kind";
import { createEditorEntityPreview, findEditorDefinition } from "./editor-entity-preview";
import { EditorViewportBuilder, type AssetBuilderPick } from "./editor-viewport-builder";

export type { AssetBuilderPick } from "./editor-viewport-builder";

/** Narrows arbitrary editor JSON before preview metadata is inspected. */
function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Reads a first-level display or rendering string while retaining a safe production fallback. */
function readString(root: JsonValue, names: readonly string[], fallback: string): string {
  if (!isObject(root)) return fallback;
  for (const [key, value] of Object.entries(root)) {
    if (names.includes(key) && typeof value === "string") return value;
  }
  return fallback;
}

/** Owns an isolated production renderer and disposes every selection preview deterministically. */
export class EditorViewport {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(50, 1, 0.1, 500);
  private readonly atlas: TextureAtlas;
  private readonly opaqueMaterial: MeshLambertMaterial;
  private readonly translucentMaterial: MeshLambertMaterial;
  private readonly builder: EditorViewportBuilder;
  private preview: Object3D | null = null;
  private entityTest: EditorEntityTestScene | null = null;
  private radius = 7;
  private azimuth = 0.65;
  private elevation = 0.55;
  private dragging = false;
  private pointer = new Vector2();
  private pointerTravel = 0;
  private frame = 0;
  private lastFrameTime = performance.now();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly empty: HTMLElement,
    private readonly title: HTMLElement,
    private readonly help: HTMLElement,
    private readonly state: EditorState,
  ) {
    this.builder = new EditorViewportBuilder(canvas, this.camera, this.scene, () => this.preview);
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setClearColor(0x101a22);
    this.atlas = createTextureAtlas();
    this.opaqueMaterial = new MeshLambertMaterial({ map: this.atlas.texture });
    this.translucentMaterial = new MeshLambertMaterial({
      map: this.atlas.texture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.scene.add(new AmbientLight(0xd6e5ee, 1.4));
    const sun = new DirectionalLight(0xfff2d2, 2.2);
    sun.position.set(5, 9, 4);
    this.scene.add(sun, new GridHelper(30, 30, 0x42606e, 0x253641));
    this.bindInput();
    this.state.subscribe(() => this.refresh());
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    this.resize();
    this.animate();
  }

  /** Restores the useful orbit distance for the current preview category. */
  resetView(): void {
    this.radius = this.state.selection?.kind === "worldgen" || this.state.selection?.kind === "biome" ? 19 : 7;
    this.azimuth = 0.65;
    this.elevation = 0.55;
  }

  /** Connects a procedural-model builder to short viewport clicks and one horizontal construction layer. */
  setAssetBuilderInteraction(handler: ((pick: AssetBuilderPick) => void) | null, layer: number): void {
    this.builder.setInteraction(handler, layer);
  }

  /** Highlights one selected procedural part without changing canonical content. */
  setAssetPartSelection(index: number | null): void {
    this.builder.setSelection(index);
  }

  /** Releases the animation loop, transient geometry, shared atlas, and WebGL renderer. */
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.disposePreview();
    this.disposeEntityTest();
    this.builder.dispose();
    this.opaqueMaterial.dispose();
    this.translucentMaterial.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
  }

  /** Starts a fresh production entity manager against memory-only persistence and actual generated terrain. */
  startEntityTest(): void {
    this.disposeEntityTest();
    this.disposePreview();
    this.preview = this.createTerrainPreview();
    this.scene.add(this.preview);
    this.entityTest = new EditorEntityTestScene(this.state);
    this.scene.add(this.entityTest.scene);
    this.radius = 24;
    this.help.textContent = "Live test · drag to orbit · wheel to zoom";
  }

  /** Spawns one authored type through the active production manager test boundary. */
  spawnTestEntity(definitionId: string): string | null {
    return this.entityTest?.spawn(definitionId) ?? null;
  }

  /** Places the isolated player beside a live actor so behavior and combat run through normal updates. */
  engageTestEntity(entityId: string): boolean { return this.entityTest?.engage(entityId) ?? false; }

  /** Applies ordinary manager damage to the requested isolated actor. */
  damageTestEntity(entityId: string, amount: number): boolean {
    return this.entityTest?.damage(entityId, amount) ?? false;
  }

  /** Returns detached blackboards from the active isolated production manager. */
  entityDebugSnapshots(): readonly EntityDebugSnapshot[] { return this.entityTest?.snapshots() ?? []; }

  /** Returns player health and recent manager events for combat-scene diagnostics. */
  entityTestStatus(): { readonly playerHealth: number; readonly messages: readonly string[] } | null {
    if (this.entityTest === null) return null;
    return { playerHealth: this.entityTest.playerHealth(), messages: this.entityTest.recentStatuses() };
  }

  /** Displays current unsaved and last-generated profiles beside one another with the same seed and renderer. */
  showWorldgenComparison(): void {
    this.disposeEntityTest();
    this.disposePreview();
    const comparison = new Group();
    const materials = [this.opaqueMaterial, this.translucentMaterial] as const;
    const current = createEditorTerrainPreview(this.state, this.atlas, materials, "current");
    const saved = createEditorTerrainPreview(this.state, this.atlas, materials, "saved");
    current.position.x -= 10;
    saved.position.x += 10;
    comparison.add(current, saved);
    this.preview = comparison;
    this.scene.add(comparison);
    this.radius = 42;
    this.help.textContent = "Before and after · drag to orbit · wheel to zoom";
  }

  /** Replaces the transient scene object when selection or unsaved content changes. */
  private refresh(): void {
    this.disposeEntityTest();
    this.disposePreview();
    const selection = this.state.selection;
    const value = this.state.selectedValue();
    if (selection === null || value === undefined) {
      this.empty.hidden = false;
      this.empty.textContent = "Choose something on the left to see it here.";
      this.title.textContent = "Project preview";
      this.help.textContent = "Choose an item from the left library";
      return;
    }
    this.empty.hidden = true;
    this.title.textContent = selection.label;
    if (!isGraphicalKind(selection.kind)) {
      this.empty.hidden = false;
      this.empty.textContent = "Rules and settings do not have a 3D object. Use the tools on the right.";
      this.title.textContent = `${selection.label} · data only`;
      this.help.textContent = "No picture for rules and settings";
      return;
    }
    this.help.textContent = selection.kind === "asset"
      ? "Click to select or place · drag to orbit · wheel to zoom"
      : "Drag to orbit · wheel to zoom";
    try {
      if (selection.kind === "worldgen" || selection.kind === "biome") {
        this.preview = this.createTerrainPreview(value);
        const previewRadius = this.preview.userData.previewRadius;
        this.radius = typeof previewRadius === "number" ? previewRadius : 30;
      } else if (selection.kind === "entity" || selection.kind === "asset") {
        const modelId = isObject(value) && typeof value.modelAssetId === "string" ? value.modelAssetId : null;
        const previewValue = modelId === null ? value : findEditorDefinition(this.state, modelId) ?? value;
        this.preview = createEditorEntityPreview(previewValue);
        this.radius = 7;
      } else if (selection.kind === "texture") {
        this.preview = this.createTexturePreview(value);
        this.radius = 6;
      } else if (selection.kind === "block") {
        this.preview = this.createBlockPreview(value);
        this.radius = 6;
      }
    } catch (error: unknown) {
      this.preview = null;
      this.empty.hidden = false;
      this.empty.textContent = error instanceof Error
        ? `Preview unavailable: ${error.message}`
        : "Preview unavailable.";
    }
    if (this.preview !== null) {
      this.scene.add(this.preview);
      this.builder.applySelection();
      const description = this.preview.userData.previewDescription;
      if (typeof description === "string") this.help.textContent = description;
    }
  }

  /** Maps production atlas UV cells onto a cube using the selected block's face assignments. */
  private createBlockPreview(value: JsonValue): Mesh {
    const geometry = new BoxGeometry(2.5, 2.5, 2.5);
    const textures = isObject(value) && isObject(value.textures) ? value.textures : undefined;
    const side = textures?.side;
    const top = textures?.top;
    const bottom = textures?.bottom;
    const fallback = readString(value, ["texture", "textureId"], "stone");
    const names = [side, side, top, bottom, side, side].map((name) => (
      typeof name === "string" ? name : fallback
    ));
    const uv = geometry.getAttribute("uv");
    names.forEach((name, face) => {
      const textureName = TEXTURE_NAMES.includes(name as TextureName) ? name as TextureName : "stone";
      const bounds = this.atlas.getUvBounds(textureName);
      const points = [
        [bounds.uMin, bounds.vMax], [bounds.uMax, bounds.vMax],
        [bounds.uMin, bounds.vMin], [bounds.uMax, bounds.vMin],
      ];
      points.forEach(([u, v], index) => uv.setXY(face * 4 + index, u ?? 0, v ?? 0));
    });
    uv.needsUpdate = true;
    const material = new MeshStandardMaterial({ map: this.atlas.texture, roughness: 0.88 });
    const mesh = new Mesh(geometry, material);
    mesh.position.y = 1.25;
    return mesh;
  }

  /** Builds a cube from an unsaved procedural texture while falling back for non-recipe data. */
  private createTexturePreview(value: JsonValue): Mesh {
    const texture = createEditorTexture(value);
    if (texture === null) return this.createBlockPreview(value);
    const mesh = new Mesh(
      new BoxGeometry(2.5, 2.5, 2.5),
      new MeshStandardMaterial({ map: texture, roughness: 0.88 }),
    );
    mesh.position.y = 1.25;
    return mesh;
  }

  /** Runs the selected real generator and production chunk mesher against the unsaved canonical snapshot. */
  private createTerrainPreview(value?: JsonValue): Object3D {
    const selection = this.state.selection;
    if (selection !== null && value !== undefined) {
      const focused = createEditorWorldObjectPreview(
        this.state,
        selection,
        value,
        this.atlas,
        [this.opaqueMaterial, this.translucentMaterial],
      );
      if (focused !== null) return focused;
    }
    const isLegacy = this.state.selection?.file.includes("legacy-") ?? false;
    return createEditorTerrainPreview(
      this.state,
      this.atlas,
      [this.opaqueMaterial, this.translucentMaterial],
      isLegacy ? "legacy" : "current",
    );
  }

  /** Implements dependency-free pointer orbit and bounded zoom without taking game input ownership. */
  private bindInput(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.pointerTravel = 0;
      this.pointer.set(event.clientX, event.clientY);
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      this.pointerTravel += Math.hypot(event.clientX - this.pointer.x, event.clientY - this.pointer.y);
      this.azimuth -= (event.clientX - this.pointer.x) * 0.008;
      this.elevation = Math.max(0.12, Math.min(1.35, this.elevation + (event.clientY - this.pointer.y) * 0.008));
      this.pointer.set(event.clientX, event.clientY);
    });
    this.canvas.addEventListener("pointerup", (event) => {
      if (this.pointerTravel < 5) this.builder.pick(event.clientX, event.clientY);
      this.dragging = false;
    });
    this.canvas.addEventListener("pointercancel", () => { this.dragging = false; });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.radius = Math.max(3, Math.min(45, this.radius * Math.exp(event.deltaY * 0.001)));
    }, { passive: false });
  }

  /** Keeps drawing-buffer dimensions and camera projection synchronized with the CSS layout. */
  private resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Renders the isolated scene continuously so orbit input remains responsive without content mutations. */
  private animate = (): void => {
    const now = performance.now();
    try {
      this.entityTest?.update(Math.max(0, (now - this.lastFrameTime) / 1000));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Entity simulation failed.";
      console.error(`[VoxelFrontierEditor] Isolated entity update failed: ${message}`);
      this.empty.hidden = false;
      this.empty.textContent = `Entity test stopped: ${message}`;
      this.disposeEntityTest();
    }
    this.lastFrameTime = now;
    const horizontal = Math.cos(this.elevation) * this.radius;
    this.camera.position.set(Math.sin(this.azimuth) * horizontal, Math.sin(this.elevation) * this.radius + 2,
      Math.cos(this.azimuth) * horizontal);
    this.camera.lookAt(0, 2, 0);
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.animate);
  };

  /** Disposes only transient selection resources while preserving the shared production atlas. */
  private disposePreview(): void {
    if (this.preview === null) return;
    this.scene.remove(this.preview);
    this.preview.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial && material.map !== null &&
            material.map !== this.atlas.texture) material.map.dispose();
        if (material !== this.opaqueMaterial && material !== this.translucentMaterial) material.dispose();
      }
    });
    this.preview = null;
  }

  /** Removes the isolated entity scene and releases its production manager without touching normal saves. */
  private disposeEntityTest(): void {
    if (this.entityTest === null) return;
    this.scene.remove(this.entityTest.scene);
    this.entityTest.dispose();
    this.entityTest = null;
  }
}

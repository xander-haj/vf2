/**
 * Orchestrates the renderer, scene, world, player, interaction, input, persistence, and HUD.
 * This is the application lifecycle boundary and the only module that advances frame-level systems.
 */
// Three.js rendering primitives and explicit game-system imports define the complete lifecycle ownership graph.
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { BlockId, HOTBAR_BLOCKS } from "./block-types";
import {
  MAX_FRAME_DELTA,
  MAX_PIXEL_RATIO,
} from "./game-config";
import { createTextureAtlas, type TextureAtlas } from "./texture-atlas";
import { BlockInteractor } from "../interaction/block-interactor";
import { InputController } from "../player/input-controller";
import { PlayerController } from "../player/player-controller";
import { WorldStorage } from "../storage/world-storage";
import { Hud } from "../ui/hud";
import { World } from "../world/world";
import { EntityManager } from "../engine/entities/entity-manager";
import type { EntityRuntimeContent } from "../engine/entities/entity-runtime";
import { ASSET_DEFINITIONS } from "../generated/asset-registry";
import { BEHAVIOR_GRAPHS } from "../generated/behavior-registry";
import { ENTITY_DEFINITIONS, ENTITY_ANIMATION_SETS } from "../generated/entity-registry";
import {
  DIALOGUE_DEFINITIONS,
  LOOT_TABLES,
  TRADE_TABLES,
} from "../generated/interaction-registry";
import { ENTITY_SPAWN_RULES } from "../generated/spawn-registry";

// A light blue sky and matching fog hide the square edge of the streamed chunk area.
const SKY_COLOR = 0x78b7e8;

/** Game constructs all systems in dependency order and advances them through one animation loop. */
export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly atlas: TextureAtlas;
  private readonly opaqueMaterial: MeshLambertMaterial;
  private readonly translucentMaterial: MeshLambertMaterial;
  private readonly storage: WorldStorage;
  private readonly world: World;
  private readonly input: InputController;
  private readonly player: PlayerController;
  private readonly entities: EntityManager;
  private readonly interactor: BlockInteractor;
  private readonly hud: Hud;
  private selectedIndex = 0;
  private hasEnteredWorld = false;
  private lastTimestamp = performance.now();
  private running = false;
  private disposed = false;

  public constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.outputColorSpace = SRGBColorSpace;

    this.scene.background = new Color(SKY_COLOR);
    this.scene.fog = new Fog(SKY_COLOR, 34, 70);
    this.camera = new PerspectiveCamera(70, 1, 0.05, 128);
    this.scene.add(this.camera);
    this.addLighting();

    this.atlas = createTextureAtlas();
    this.opaqueMaterial = new MeshLambertMaterial({
      map: this.atlas.texture,
      fog: true,
    });
    this.translucentMaterial = new MeshLambertMaterial({
      map: this.atlas.texture,
      fog: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.storage = new WorldStorage();
    this.world = new World(
      this.scene,
      [this.opaqueMaterial, this.translucentMaterial],
      this.atlas,
      this.storage,
    );
    this.input = new InputController(this.canvas, this.handleGameplayStateChange);
    this.player = new PlayerController(this.camera, this.world.findSpawn());
    const content: EntityRuntimeContent = {
      assets: ASSET_DEFINITIONS,
      definitions: ENTITY_DEFINITIONS,
      animationSets: ENTITY_ANIMATION_SETS,
      behaviors: BEHAVIOR_GRAPHS,
      spawnRules: ENTITY_SPAWN_RULES,
      lootTables: LOOT_TABLES,
      dialogues: DIALOGUE_DEFINITIONS,
      trades: TRADE_TABLES,
    };
    this.entities = new EntityManager(
      this.scene,
      this.world,
      this.player,
      this.storage,
      content,
      this.handleEntityStatus,
    );
    this.interactor = new BlockInteractor(
      this.camera,
      this.world,
      this.player,
      this.input,
      this.entities,
    );
    this.hud = new Hud(
      () => this.input.requestGameplay(),
      (index) => this.selectBlock(index),
      this.input.isMobileEnabled(),
      (index) => this.chooseDialogue(index),
      (index) => this.executeTrade(index),
    );
    this.selectBlock(0);
    this.syncEntityHud();
    this.hud.setPaused(true, false);

    window.addEventListener("resize", this.handleResize);
    this.handleResize();
  }

  /** Adds broad sky fill and angled sunlight so cube faces remain visually distinct. */
  private addLighting(): void {
    const ambient = new HemisphereLight(0xc9e8ff, 0x66704f, 1.65);
    this.scene.add(ambient);
    const sun = new DirectionalLight(0xfff1cf, 1.7);
    sun.position.set(-35, 52, 24);
    this.scene.add(sun);
  }

  /** Resizes the drawing buffer and camera projection to match the current CSS viewport. */
  private readonly handleResize = (): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  };

  /** Mirrors desktop or mobile gameplay state into pause UI and records the first successful entry. */
  private readonly handleGameplayStateChange = (): void => {
    const active = this.input.isGameplayActive();
    if (active) {
      this.hasEnteredWorld = true;
    }
    const dialogueOpen = this.entities.getActiveDialogue() !== null;
    this.hud.setPaused(!active && !dialogueOpen, this.hasEnteredWorld);
  };

  /** Routes simulation outcomes into the persistent accessible status landmark. */
  private readonly handleEntityStatus = (message: string): void => {
    this.hud.setEntityStatus(message);
  };

  /** Refreshes health, dialogue, and offer controls from authoritative runtime state. */
  private syncEntityHud(): void {
    const health = this.player.getHealth();
    this.hud.setHealth(health.current, health.maximum);
    this.hud.setDialogue(this.entities.getActiveDialogue(), this.entities.getActiveTradeOffers());
  }

  /** Advances a conversation and returns to captured play after a terminal choice. */
  private chooseDialogue(index: number): void {
    const active = this.entities.chooseDialogue(index);
    this.syncEntityHud();
    if (active === null) {
      this.input.requestGameplay();
    }
  }

  /** Executes one visible offer and immediately reports its exact atomic result. */
  private executeTrade(index: number): void {
    const result = this.entities.executeTrade(index);
    this.hud.setEntityStatus(result.message);
    this.syncEntityHud();
  }

  /** Normalizes a requested slot, then updates both placement behavior and visual selection. */
  private selectBlock(index: number): void {
    const blockCount = HOTBAR_BLOCKS.length;
    this.selectedIndex = ((index % blockCount) + blockCount) % blockCount;
    const blockId = HOTBAR_BLOCKS[this.selectedIndex] ?? BlockId.Grass;
    this.interactor.setSelectedBlock(blockId);
    this.hud.setSelectedIndex(this.selectedIndex);
  }

  /** Consumes number-key and wheel requests once per active frame. */
  private updateHotbarSelection(): void {
    const absoluteIndex = this.input.consumeHotbarIndex();
    if (absoluteIndex !== null) {
      this.selectBlock(absoluteIndex);
    }
    const delta = this.input.consumeHotbarDelta();
    if (delta !== 0) {
      this.selectBlock(this.selectedIndex + delta);
    }
  }

  /** Advances one simulation frame when active and always renders the latest scene while paused. */
  private readonly renderFrame = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const deltaSeconds = Math.min((timestamp - this.lastTimestamp) / 1000, MAX_FRAME_DELTA);
    this.lastTimestamp = timestamp;
    const active = this.input.isGameplayActive();

    // Streaming precedes physics so collision never queries an area after its chunk should have loaded.
    if (active) {
      this.world.updateStreaming(this.player.getPosition());
      this.player.update(deltaSeconds, this.input, this.world);
      this.entities.update(deltaSeconds);
      this.updateHotbarSelection();
    }
    this.interactor.update(active && this.player.isAlive());
    if (!this.world.isPersistent()) {
      this.hud.showPersistenceWarning();
    }
    this.syncEntityHud();
    if (active && this.entities.getActiveDialogue() !== null) {
      this.input.releaseGameplay();
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** Starts the browser-owned animation loop exactly once. */
  public start(): void {
    if (this.running || this.disposed) {
      return;
    }
    this.running = true;
    this.lastTimestamp = performance.now();
    this.renderer.setAnimationLoop(this.renderFrame);
  }

  /** Stops animation, detaches listeners, and releases every owned CPU and GPU resource. */
  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.handleResize);
    this.interactor.dispose();
    this.entities.dispose();
    this.input.dispose();
    this.world.dispose();
    this.opaqueMaterial.dispose();
    this.translucentMaterial.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
  }
}

/**
 * Orchestrates the renderer, scene, world, player, interaction, input, persistence, and HUD.
 * This is the application lifecycle boundary and the only module that advances frame-level systems.
 */

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

// A light blue sky and matching fog hide the square edge of the streamed chunk area.
const SKY_COLOR = 0x78b7e8;

/** Game constructs all systems in dependency order and advances them through one animation loop. */
export class Game {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly atlas: TextureAtlas;
  private readonly material: MeshLambertMaterial;
  private readonly storage: WorldStorage;
  private readonly world: World;
  private readonly input: InputController;
  private readonly player: PlayerController;
  private readonly interactor: BlockInteractor;
  private readonly hud: Hud;
  private selectedIndex = 0;
  private hasEnteredWorld = false;
  private lastTimestamp = performance.now();
  private running = false;

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
    this.material = new MeshLambertMaterial({
      map: this.atlas.texture,
      fog: true,
    });
    this.storage = new WorldStorage();
    this.world = new World(this.scene, this.material, this.atlas, this.storage);
    this.input = new InputController(this.canvas);
    this.player = new PlayerController(this.camera, this.world.findSpawn());
    this.interactor = new BlockInteractor(this.camera, this.world, this.player, this.input);
    this.hud = new Hud(
      () => this.input.requestPointerLock(),
      (index) => this.selectBlock(index),
    );
    this.selectBlock(0);
    this.hud.setPaused(true, false);

    window.addEventListener("resize", this.handleResize);
    document.addEventListener("pointerlockchange", this.handlePointerLockChange);
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

  /** Mirrors browser pointer-lock state into pause UI and tracks whether the first entry occurred. */
  private readonly handlePointerLockChange = (): void => {
    const active = this.input.isPointerLocked();
    if (active) {
      this.hasEnteredWorld = true;
    }
    this.hud.setPaused(!active, this.hasEnteredWorld);
  };

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
    const active = this.input.isPointerLocked();

    // Streaming precedes physics so collision never queries an area after its chunk should have loaded.
    if (active) {
      this.world.updateStreaming(this.player.getPosition());
      this.player.update(deltaSeconds, this.input, this.world);
      this.updateHotbarSelection();
    }
    const interaction = this.interactor.update(active);
    if (interaction.changedWorld && !this.world.isPersistent()) {
      this.hud.showPersistenceWarning();
    }
    this.renderer.render(this.scene, this.camera);
  };

  /** Starts the browser-owned animation loop exactly once. */
  public start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTimestamp = performance.now();
    this.renderer.setAnimationLoop(this.renderFrame);
  }

  /** Stops animation, detaches listeners, and releases every owned CPU and GPU resource. */
  public dispose(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.handleResize);
    document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
    this.interactor.dispose();
    this.input.dispose();
    this.world.dispose();
    this.material.dispose();
    this.atlas.texture.dispose();
    this.renderer.dispose();
  }
}

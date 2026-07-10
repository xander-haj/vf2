/** Runs the production entity manager against generated terrain and memory-only persistence for editor testing. */

// Production simulation contracts are paired with editor-only adapters and an isolated Three.js scene.
import { Scene, Vector3 } from "three";
import type { EntityDebugSnapshot } from "../engine/entities/entity-debug";
import { EntityManager } from "../engine/entities/entity-manager";
import type {
  EntityManagerPlayer,
  EntityManagerWorld,
  EntityPersistenceBoundary,
} from "../engine/entities/entity-runtime";
import type { PersistedEntityState } from "../engine/entities/entity-model";
import { isSolidBlock } from "../game/block-types";
import { Chunk } from "../world/chunk";
import { EngineWorldGenerator } from "../engine/worldgen/engine-world-generator";
import type { EditorState } from "./editor-state";
import { compileEditorWorldgen } from "./editor-worldgen-compiler";
import { compileEditorEntityContent } from "./editor-entity-content";

/** MemoryPersistence proves editor tests cannot reach or modify normal local-storage world saves. */
class MemoryPersistence implements EntityPersistenceBoundary {
  private states: readonly PersistedEntityState[] = [];
  private inventory: Readonly<Record<string, number>> = {};

  /** Returns detached entity state captured by the isolated manager's last persistence interval. */
  getEntityStates(): readonly PersistedEntityState[] { return structuredClone(this.states); }

  /** Returns the isolated test inventory without sharing a mutable object. */
  getInventoryState(): Readonly<Record<string, number>> { return { ...this.inventory }; }

  /** Stores only in memory and reports success without invoking browser storage. */
  recordEntityState(
    states: readonly PersistedEntityState[],
    inventory: Readonly<Record<string, number>>,
  ): boolean {
    this.states = structuredClone(states);
    this.inventory = { ...inventory };
    return true;
  }
}

/** TestPlayer implements the same narrow combat contract as the game player without input or persistence. */
class TestPlayer implements EntityManagerPlayer {
  readonly position = new Vector3();
  private health = 20;

  /** Returns the live test position consumed by spawning, behavior, and combat. */
  getPosition(): Vector3 { return this.position; }

  /** Copies the test eye position into the caller-owned vector to avoid frame allocations. */
  getEyePosition(target: Vector3): Vector3 {
    target.copy(this.position);
    target.y += 1.62;
    return target;
  }

  /** Reports whether production behavior and combat may still target the test player. */
  isAlive(): boolean { return this.health > 0; }

  /** Applies bounded production combat damage to editor-only health. */
  takeDamage(amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || this.health <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    return true;
  }

  /** Restores test combat without reconstructing the terrain or entity manager. */
  restore(): void { this.health = 20; }

  /** Exposes detached player health for the editor diagnostics panel. */
  getHealth(): number { return this.health; }
}

/** GeneratedTestWorld provides real engine-v2 chunks to every production entity subsystem. */
class GeneratedTestWorld implements EntityManagerWorld {
  private readonly chunks = new Map<string, Chunk>();

  constructor(
    private readonly seed: number,
    private readonly generator: EngineWorldGenerator,
    private readonly dimensions: { chunkSize: number; worldHeight: number; sectionHeight: number },
    private readonly spawningSalt: number,
  ) {}

  /** Returns the exact seed used by the editor's production terrain preview. */
  getSeed(): number { return this.seed; }

  /** Returns the unsaved authored spawning stream salt used by EntitySpawner hashes. */
  getSpawningSalt(): number { return this.spawningSalt; }

  /** Returns the profile chunk width used by deterministic spawn partitioning. */
  getChunkSize(): number { return this.dimensions.chunkSize; }

  /** Delegates spawn elevation to the production density and overhang generator. */
  getTerrainHeight(worldX: number, worldZ: number): number {
    return this.generator.getTerrainHeight(Math.floor(worldX), Math.floor(worldZ));
  }

  /** Delegates environmental spawn filters to the production climate selector. */
  getBiomeId(worldX: number, worldZ: number): string {
    return this.generator.getBiome(Math.floor(worldX), Math.floor(worldZ)).id;
  }

  /** Scans production blocks above a coordinate using the same direct-skylight rule as World. */
  getSkyLight(worldX: number, y: number, worldZ: number): number {
    for (let scanY = Math.max(0, Math.floor(y) + 1); scanY < this.dimensions.worldHeight; scanY += 1) {
      if (this.isSolid(worldX, scanY, worldZ)) return 0;
    }
    return 1;
  }

  /** Resolves voxel collision from lazily generated, immutable production chunks. */
  isSolid(worldX: number, y: number, worldZ: number): boolean {
    if (y < 0 || y >= this.dimensions.worldHeight) return y < 0;
    const x = Math.floor(worldX);
    const z = Math.floor(worldZ);
    const chunkX = Math.floor(x / this.dimensions.chunkSize);
    const chunkZ = Math.floor(z / this.dimensions.chunkSize);
    const chunk = this.getChunk(chunkX, chunkZ);
    return isSolidBlock(chunk.getBlock(
      x - chunkX * this.dimensions.chunkSize,
      Math.floor(y),
      z - chunkZ * this.dimensions.chunkSize,
    ));
  }

  /** Generates each queried chunk once so AI tests remain deterministic and bounded by their explored area. */
  private getChunk(chunkX: number, chunkZ: number): Chunk {
    const key = `${chunkX},${chunkZ}`;
    const existing = this.chunks.get(key);
    if (existing !== undefined) return existing;
    const chunk = new Chunk(chunkX, chunkZ, this.dimensions);
    this.generator.generateChunk(chunk);
    this.chunks.set(key, chunk);
    if (this.chunks.size > 64) {
      const oldest = this.chunks.keys().next().value as string | undefined;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
    return chunk;
  }

  /** Releases cached voxel arrays when the isolated test scene closes. */
  dispose(): void { this.chunks.clear(); }
}

/** EditorEntityTestScene owns one disposable, isolated production simulation and its rendered scene. */
export class EditorEntityTestScene {
  readonly scene = new Scene();
  private readonly player = new TestPlayer();
  private readonly world: GeneratedTestWorld;
  private readonly manager: EntityManager;
  private readonly statuses: string[] = [];

  constructor(state: EditorState) {
    const compiled = compileEditorWorldgen(state.snapshot());
    const generator = new EngineWorldGenerator(
      state.previewSeed,
      compiled.profile,
      compiled.dimensions.chunkSize,
      compiled.dimensions.worldHeight,
      compiled.dimensions.sectionHeight,
    );
    this.world = new GeneratedTestWorld(
      state.previewSeed,
      generator,
      compiled.dimensions,
      compiled.profile.streams.spawning,
    );
    const surface = this.world.getTerrainHeight(8, 8);
    this.player.position.set(8.5, surface + 1, 8.5);
    this.scene.position.set(-8, -compiled.profile.seaLevel + 1, -8);
    this.manager = new EntityManager(
      this.scene,
      this.world,
      this.player,
      new MemoryPersistence(),
      compileEditorEntityContent(state.snapshot()),
      (message) => {
        this.statuses.push(message);
        if (this.statuses.length > 50) this.statuses.shift();
      },
    );
  }

  /** Advances the normal manager update order with a bounded editor frame delta. */
  update(deltaSeconds: number): void { this.manager.update(Math.min(deltaSeconds, 0.05)); }

  /** Spawns a selected definition through EntityManager's ordinary instance and renderer path. */
  spawn(definitionId: string): string | null {
    const position = this.player.position.clone().add(new Vector3(2, 0, 0));
    position.y = this.world.getTerrainHeight(position.x, position.z) + 1;
    return this.manager.spawnForTest(definitionId, position);
  }

  /** Moves the test player into combat range so authored perception, behavior, and attacks run normally. */
  engage(entityId: string): boolean {
    const entity = this.manager.getDebugSnapshots().find((snapshot) => snapshot.id === entityId);
    if (entity === undefined) return false;
    this.player.restore();
    this.player.position.set(entity.position[0], entity.position[1], entity.position[2] + 1);
    return true;
  }

  /** Applies normal entity damage for repeatable hurt, death, and loot tests. */
  damage(entityId: string, amount: number): boolean { return this.manager.damageForTest(entityId, amount); }

  /** Returns detached live blackboards for behavior, targeting, intent, health, and transform inspection. */
  snapshots(): readonly EntityDebugSnapshot[] { return this.manager.getDebugSnapshots(); }

  /** Returns current editor-only player health after production combat updates. */
  playerHealth(): number { return this.player.getHealth(); }

  /** Returns recent production status messages without exposing a mutable internal queue. */
  recentStatuses(): readonly string[] { return this.statuses.slice(-5); }

  /** Saves only to memory and releases normal entity render, asset, loot, and scene resources. */
  dispose(): void {
    this.manager.dispose();
    this.world.dispose();
  }
}

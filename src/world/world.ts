/**
 * Coordinates chunk streaming, generation, meshing, block lookup, edits, and resource cleanup.
 * World is the authoritative boundary used by physics, interaction, and rendering systems.
 */

import { type Material, Scene, Vector3 } from "three";
import { BlockId, isSolidBlock } from "../game/block-types";
import type { TextureAtlas } from "../game/texture-atlas";
import type { WorldStorage } from "../storage/world-storage";
import { Chunk } from "./chunk";
import { ChunkMesher } from "./chunk-mesher";
import { WorldGenerator } from "./world-generator";
import type { CoordinateGenerationExplanation } from "../engine/worldgen/engine-world-generator";
import {
  resolveWorldProfile,
  validateWorldProfile,
  type WorldProfile,
} from "./world-profile";

// Horizontal neighbor offsets identify chunk meshes affected by border changes.
const CHUNK_NEIGHBORS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Converts chunk coordinates into a stable map key that supports negative positions. */
function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

/** Converts an absolute coordinate to its containing chunk using profile-sized floor division. */
function worldToChunk(coordinate: number, chunkSize: number): number {
  return Math.floor(coordinate / chunkSize);
}

/** World keeps only nearby chunks resident and remeshes exactly the regions affected by edits. */
export class World {
  private readonly chunks = new Map<string, Chunk>();
  private readonly profile: WorldProfile;
  private readonly generator: WorldGenerator;
  private readonly mesher: ChunkMesher;
  private lastCenterChunk: string | null = null;

  public constructor(
    private readonly scene: Scene,
    materials: readonly [Material, Material],
    atlas: TextureAtlas,
    private readonly storage: WorldStorage,
  ) {
    this.profile = resolveWorldProfile(storage.getWorldGenerationIdentity());
    validateWorldProfile(this.profile);
    this.generator = new WorldGenerator(storage.getSeed(), this.profile);
    this.mesher = new ChunkMesher(materials, atlas, this.profile.dimensions);
  }

  /** Creates deterministic block data and overlays saved player changes without building a mesh yet. */
  private createChunk(chunkX: number, chunkZ: number): Chunk {
    const chunk = new Chunk(chunkX, chunkZ, this.profile.dimensions);
    this.generator.generateChunk(chunk);
    this.storage.applyEditsToChunk(
      chunkX,
      chunkZ,
      this.profile.dimensions.chunkSize,
      (localX, y, localZ, blockId) => {
        chunk.setBlock(localX, y, localZ, blockId);
      },
    );
    this.chunks.set(chunkKey(chunkX, chunkZ), chunk);
    return chunk;
  }

  /** Replaces one vertical section mesh while preserving shared material and neighboring sections. */
  private rebuildChunkSection(chunk: Chunk, sectionIndex: number): void {
    const section = chunk.sections[sectionIndex];
    if (section === undefined) {
      return;
    }
    if (section.mesh !== null) {
      this.scene.remove(section.mesh);
      section.disposeGeometry();
    }
    const mesh = this.mesher.buildMesh(
      chunk,
      sectionIndex,
      (x, y, z) => this.getBlock(x, y, z),
    );
    section.mesh = mesh;
    this.scene.add(mesh);
  }

  /** Rebuilds every vertical section after chunk streaming changes horizontal boundary visibility. */
  private rebuildChunk(chunk: Chunk): void {
    chunk.sections.forEach((_, sectionIndex) => {
      this.rebuildChunkSection(chunk, sectionIndex);
    });
  }

  /** Removes all section meshes from the scene before their chunk storage is discarded. */
  private removeChunkMeshes(chunk: Chunk): void {
    chunk.sections.forEach((section) => {
      if (section.mesh !== null) {
        this.scene.remove(section.mesh);
      }
    });
    chunk.disposeGeometry();
  }

  /** Adds a chunk and its four horizontal neighbors to a deduplicated remesh set. */
  private markChunkAndNeighbors(
    affected: Set<string>,
    chunkX: number,
    chunkZ: number,
  ): void {
    affected.add(chunkKey(chunkX, chunkZ));
    CHUNK_NEIGHBORS.forEach(([offsetX, offsetZ]) => {
      affected.add(chunkKey(chunkX + offsetX, chunkZ + offsetZ));
    });
  }

  /** Loads and unloads chunks when the player enters a new chunk, then repairs affected borders. */
  public updateStreaming(playerPosition: Vector3): void {
    const { chunkSize } = this.profile.dimensions;
    const renderDistance = this.profile.renderDistance;
    const centerX = worldToChunk(playerPosition.x, chunkSize);
    const centerZ = worldToChunk(playerPosition.z, chunkSize);
    const centerKey = chunkKey(centerX, centerZ);
    if (centerKey === this.lastCenterChunk) {
      return;
    }
    this.lastCenterChunk = centerKey;
    const desired = new Set<string>();
    const affected = new Set<string>();
    const coordinates: Array<readonly [number, number, number]> = [];

    // Distance sorting loads the visible center first and makes initial generation feel immediate.
    for (let offsetZ = -renderDistance; offsetZ <= renderDistance; offsetZ += 1) {
      for (let offsetX = -renderDistance; offsetX <= renderDistance; offsetX += 1) {
        coordinates.push([centerX + offsetX, centerZ + offsetZ, offsetX * offsetX + offsetZ * offsetZ]);
      }
    }
    coordinates.sort((left, right) => left[2] - right[2]);
    coordinates.forEach(([chunkX, chunkZ]) => {
      const key = chunkKey(chunkX, chunkZ);
      desired.add(key);
      if (!this.chunks.has(key)) {
        this.createChunk(chunkX, chunkZ);
        this.markChunkAndNeighbors(affected, chunkX, chunkZ);
      }
    });

    // Chunks outside the exact desired square are removed to keep memory and draw calls bounded.
    this.chunks.forEach((chunk, key) => {
      if (desired.has(key)) {
        return;
      }
      this.removeChunkMeshes(chunk);
      this.chunks.delete(key);
      this.markChunkAndNeighbors(affected, chunk.chunkX, chunk.chunkZ);
    });

    // Remeshing after all data changes ensures border queries see the final loaded set.
    affected.forEach((key) => {
      const chunk = this.chunks.get(key);
      if (chunk !== undefined) {
        this.rebuildChunk(chunk);
      }
    });
  }

  /** Returns a world block, with solid bedrock-like space below and empty space above the height limit. */
  public getBlock(worldX: number, y: number, worldZ: number): BlockId {
    const integerX = Math.floor(worldX);
    const integerY = Math.floor(y);
    const integerZ = Math.floor(worldZ);
    if (integerY < 0) {
      return BlockId.Stone;
    }
    const { chunkSize, worldHeight } = this.profile.dimensions;
    if (integerY >= worldHeight) {
      return BlockId.Air;
    }
    const chunkX = worldToChunk(integerX, chunkSize);
    const chunkZ = worldToChunk(integerZ, chunkSize);
    const chunk = this.chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk === undefined) {
      return BlockId.Air;
    }
    return chunk.getBlock(integerX - chunkX * chunkSize, integerY, integerZ - chunkZ * chunkSize);
  }

  /** Reports whether the requested world cell blocks player movement. */
  public isSolid(worldX: number, y: number, worldZ: number): boolean {
    return isSolidBlock(this.getBlock(worldX, y, worldZ));
  }

  /** Returns the immutable world seed used by deterministic spawning and generation streams. */
  public getSeed(): number {
    return this.generator.seed;
  }

  /** Returns the authored spawning stream salt without exposing the complete generation profile. */
  public getSpawningSalt(): number {
    return this.profile.engine?.streams.spawning ?? 0;
  }

  /** Returns the active profile's chunk width for coordinate-stable subsystem partitioning. */
  public getChunkSize(): number {
    return this.profile.dimensions.chunkSize;
  }

  /** Returns the untouched terrain surface used for entity spawn candidates. */
  public getTerrainHeight(worldX: number, worldZ: number): number {
    return this.generator.getTerrainHeight(Math.floor(worldX), Math.floor(worldZ));
  }

  /** Returns the generated biome identity at a horizontal coordinate. */
  public getBiomeId(worldX: number, worldZ: number): string {
    return this.generator.getBiomeId(Math.floor(worldX), Math.floor(worldZ));
  }

  /** Replays every engine-v2 pass for one coordinate for diagnostics and editor parity. */
  public explainCoordinate(
    worldX: number,
    y: number,
    worldZ: number,
  ): CoordinateGenerationExplanation | null {
    return this.generator.explainCoordinate(Math.floor(worldX), Math.floor(y), Math.floor(worldZ));
  }

  /** Computes direct vertical skylight from the current loaded block state. */
  public getSkyLight(worldX: number, y: number, worldZ: number): number {
    const startY = Math.max(0, Math.floor(y) + 1);
    for (let scanY = startY; scanY < this.profile.dimensions.worldHeight; scanY += 1) {
      if (this.isSolid(worldX, scanY, worldZ)) {
        return 0;
      }
    }
    return 1;
  }

  /** Applies a player edit, persists it, and rebuilds the edited chunk plus any touched border neighbor. */
  public setBlock(worldX: number, y: number, worldZ: number, blockId: BlockId): boolean {
    const integerX = Math.floor(worldX);
    const integerY = Math.floor(y);
    const integerZ = Math.floor(worldZ);
    const { chunkSize, sectionHeight, worldHeight } = this.profile.dimensions;
    if (integerY < 0 || integerY >= worldHeight) {
      return false;
    }
    const chunkX = worldToChunk(integerX, chunkSize);
    const chunkZ = worldToChunk(integerZ, chunkSize);
    const chunk = this.chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk === undefined) {
      return false;
    }
    const localX = integerX - chunkX * chunkSize;
    const localZ = integerZ - chunkZ * chunkSize;
    if (!chunk.setBlock(localX, integerY, localZ, blockId)) {
      return false;
    }
    const generated = this.generator.getGeneratedBlock(integerX, integerY, integerZ);
    this.storage.recordEdit(integerX, integerY, integerZ, blockId, generated);
    const sectionIndex = Math.floor(integerY / sectionHeight);
    const sectionLocalY = integerY - sectionIndex * sectionHeight;
    this.rebuildChunkSection(chunk, sectionIndex);

    // Horizontal border edits expose or hide faces in the matching section of one cardinal neighbor.
    CHUNK_NEIGHBORS.forEach(([offsetX, offsetZ]) => {
      const touchesX = offsetX === -1 ? localX === 0 : offsetX === 1 ? localX === chunkSize - 1 : true;
      const touchesZ = offsetZ === -1 ? localZ === 0 : offsetZ === 1 ? localZ === chunkSize - 1 : true;
      if (touchesX && touchesZ) {
        const neighbor = this.chunks.get(chunkKey(chunkX + offsetX, chunkZ + offsetZ));
        if (neighbor !== undefined) {
          this.rebuildChunkSection(neighbor, sectionIndex);
        }
      }
    });

    // A face crossing a vertical section boundary requires the immediately adjacent section to remesh too.
    if (sectionLocalY === 0) {
      this.rebuildChunkSection(chunk, sectionIndex - 1);
    }
    if (sectionLocalY === sectionHeight - 1) {
      this.rebuildChunkSection(chunk, sectionIndex + 1);
    }
    return true;
  }

  /** Finds a safe loaded spawn point by scanning nearby columns for their highest solid surface. */
  public findSpawn(): Vector3 {
    this.updateStreaming(new Vector3(0, 0, 0));
    const worldHeight = this.profile.dimensions.worldHeight;

    // Expanding rings prefer the origin while still avoiding an unusually tall nearby tree crown.
    for (let radius = 0; radius <= 12; radius += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          if (radius > 0 && Math.abs(x) !== radius && Math.abs(z) !== radius) {
            continue;
          }
          for (let y = worldHeight - 3; y >= 0; y -= 1) {
            if (
              this.isSolid(x, y, z)
              && this.getBlock(x, y + 1, z) === BlockId.Air
              && this.getBlock(x, y + 2, z) === BlockId.Air
            ) {
              return new Vector3(x + 0.5, y + 1.01, z + 0.5);
            }
          }
        }
      }
    }
    return new Vector3(0.5, worldHeight - 2, 0.5);
  }

  /** Reports whether save operations remain available after the latest world edit. */
  public isPersistent(): boolean {
    return this.storage.isPersistent();
  }

  /** Releases chunk geometry when the game shuts down or initialization is rolled back. */
  public dispose(): void {
    this.chunks.forEach((chunk) => {
      this.removeChunkMeshes(chunk);
    });
    this.chunks.clear();
    this.generator.dispose();
  }
}

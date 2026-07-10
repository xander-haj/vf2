/** Places region-spaced procedural ruins and wells before smaller surface decorations. */

import { BlockId } from "../../game/block-types";
import type { Chunk } from "../../world/chunk";
import type {
  EngineBiomeDefinition,
  EngineWorldgenProfile,
  StructureDefinition,
} from "./generation-context";
import type { NamedSeedStream, SeedStreamFactory } from "./seed-stream";

/** Returns whether a structure's tag filter admits a biome. */
function permitsBiome(required: readonly string[], biome: EngineBiomeDefinition): boolean {
  return required.length === 0 || required.some((tag) => tag === biome.id || biome.tags.includes(tag));
}

/** StructurePlacer selects one stable candidate per spacing region and emits complete templates across chunks. */
export class StructurePlacer {
  private readonly structureStreams = new Map<string, NamedSeedStream>();

  public constructor(
    private readonly streams: SeedStreamFactory,
    private readonly profile: EngineWorldgenProfile,
  ) {}

  /** Places every structure whose region candidate overlaps the target chunk. */
  public placeStructures(
    chunk: Chunk,
    getSurfaceHeight: (worldX: number, worldZ: number) => number,
    getBiome: (worldX: number, worldZ: number) => EngineBiomeDefinition,
  ): void {
    const chunkSize = chunk.dimensions.chunkSize;
    const startX = chunk.chunkX * chunkSize;
    const startZ = chunk.chunkZ * chunkSize;
    for (const structure of this.profile.structures) {
      const stream = this.getStream(structure.id);
      const footprintRadius = this.getFootprintRadius(structure);
      const minRegionX = Math.floor((startX - footprintRadius) / structure.spacing);
      const maxRegionX = Math.floor((startX + chunkSize + footprintRadius) / structure.spacing);
      const minRegionZ = Math.floor((startZ - footprintRadius) / structure.spacing);
      const maxRegionZ = Math.floor((startZ + chunkSize + footprintRadius) / structure.spacing);
      for (let regionZ = minRegionZ; regionZ <= maxRegionZ; regionZ += 1) {
        for (let regionX = minRegionX; regionX <= maxRegionX; regionX += 1) {
          if (stream.sampleUnit(regionX, 0, regionZ, 601) >= structure.chance) continue;
          const candidate = this.getCandidate(regionX, regionZ, structure, stream);
          const biome = getBiome(candidate.x, candidate.z);
          if (!permitsBiome(structure.biomeTags, biome)) continue;
          const surface = getSurfaceHeight(candidate.x, candidate.z);
          if (surface <= this.profile.seaLevel) continue;
          if (structure.kind === "template") {
            this.placeTemplate(chunk, candidate.x, surface, candidate.z, structure);
          } else if (structure.kind === "ruin") {
            this.placeRuin(chunk, candidate.x, surface, candidate.z, structure, stream);
          } else {
            this.placeWell(chunk, candidate.x, surface, candidate.z, structure);
          }
        }
      }
    }
  }

  /** Emits validated offset and inclusive-fill operations from a canonical structure template. */
  private placeTemplate(
    chunk: Chunk,
    centerX: number,
    surface: number,
    centerZ: number,
    structure: StructureDefinition,
  ): void {
    for (const operation of structure.template ?? []) {
      if (operation.offset !== undefined) {
        const [x, y, z] = operation.offset;
        if (y === 0) this.supportFoundation(chunk, centerX + x, surface, centerZ + z, structure);
        this.set(chunk, centerX + x, surface + 1 + y, centerZ + z, operation.block);
        continue;
      }
      if (operation.fill === undefined) continue;
      const { from, to } = operation.fill;
      for (let y = from[1]; y <= to[1]; y += 1) {
        for (let z = from[2]; z <= to[2]; z += 1) {
          for (let x = from[0]; x <= to[0]; x += 1) {
            if (y === 0) this.supportFoundation(chunk, centerX + x, surface, centerZ + z, structure);
            this.set(chunk, centerX + x, surface + 1 + y, centerZ + z, operation.block);
          }
        }
      }
    }
  }

  /** Computes the horizontal reach used to scan templates across target chunk boundaries. */
  private getFootprintRadius(structure: StructureDefinition): number {
    if (structure.kind === "ruin") return 4;
    if (structure.kind === "well") return 3;
    let radius = 0;
    for (const operation of structure.template ?? []) {
      const points = operation.offset === undefined
        ? [...operation.fill!.from, ...operation.fill!.to]
        : [...operation.offset];
      for (const coordinate of points) radius = Math.max(radius, Math.abs(coordinate));
    }
    return radius + 1;
  }

  /** Selects a candidate inside the region while honoring minimum edge separation. */
  private getCandidate(
    regionX: number,
    regionZ: number,
    structure: StructureDefinition,
    stream: NamedSeedStream,
  ): { readonly x: number; readonly z: number } {
    const usable = Math.max(1, structure.spacing - structure.separation * 2);
    const offsetX = Math.min(usable - 1, Math.floor(stream.sampleUnit(regionX, 0, regionZ, 613) * usable));
    const offsetZ = Math.min(usable - 1, Math.floor(stream.sampleUnit(regionX, 0, regionZ, 617) * usable));
    return {
      x: regionX * structure.spacing + structure.separation + offsetX,
      z: regionZ * structure.spacing + structure.separation + offsetZ,
    };
  }

  /** Emits a seven-block square broken ruin with deterministic missing wall sections. */
  private placeRuin(
    chunk: Chunk,
    centerX: number,
    surface: number,
    centerZ: number,
    structure: StructureDefinition,
    stream: NamedSeedStream,
  ): void {
    const radius = 3;
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        this.supportFoundation(chunk, centerX + dx, surface, centerZ + dz, structure);
        this.set(chunk, centerX + dx, surface + 1, centerZ + dz, structure.foundationBlock);
        const edge = Math.abs(dx) === radius || Math.abs(dz) === radius;
        if (!edge) continue;
        const wallHeight = 1 + Math.floor(stream.sampleUnit(centerX + dx, 0, centerZ + dz, 631) * 4);
        if (stream.sampleUnit(centerX + dx, 0, centerZ + dz, 641) < 0.22) continue;
        for (let dy = 1; dy <= wallHeight; dy += 1) {
          this.set(chunk, centerX + dx, surface + 1 + dy, centerZ + dz, structure.wallBlock);
        }
      }
    }
    this.set(chunk, centerX, surface + 2, centerZ, structure.accentBlock);
  }

  /** Emits a roofed five-block well with corner pillars and an accent-lined basin. */
  private placeWell(
    chunk: Chunk,
    centerX: number,
    surface: number,
    centerZ: number,
    structure: StructureDefinition,
  ): void {
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const rim = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        this.supportFoundation(chunk, centerX + dx, surface, centerZ + dz, structure);
        this.set(
          chunk,
          centerX + dx,
          surface + 1,
          centerZ + dz,
          rim ? structure.wallBlock : structure.accentBlock,
        );
      }
    }
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as const) {
      for (let dy = 2; dy <= 4; dy += 1) {
        this.set(chunk, centerX + dx, surface + dy, centerZ + dz, structure.wallBlock);
      }
    }
    for (let dz = -2; dz <= 2; dz += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        this.set(chunk, centerX + dx, surface + 5, centerZ + dz, structure.foundationBlock);
      }
    }
  }

  /** Writes an absolute structure coordinate only when it belongs to the target chunk. */
  private set(chunk: Chunk, worldX: number, y: number, worldZ: number, block: BlockId): void {
    const chunkSize = chunk.dimensions.chunkSize;
    const localX = worldX - chunk.chunkX * chunkSize;
    const localZ = worldZ - chunk.chunkZ * chunkSize;
    if (localX < 0 || localX >= chunkSize || localZ < 0 || localZ >= chunkSize) return;
    if (y < 0 || y >= chunk.dimensions.worldHeight) return;
    chunk.setBlock(localX, y, localZ, block);
  }

  /** Extends a bounded foundation through air or fluid so structures remain supported on local slopes. */
  private supportFoundation(
    chunk: Chunk,
    worldX: number,
    surface: number,
    worldZ: number,
    structure: StructureDefinition,
  ): void {
    const chunkSize = chunk.dimensions.chunkSize;
    const localX = worldX - chunk.chunkX * chunkSize;
    const localZ = worldZ - chunk.chunkZ * chunkSize;
    if (localX < 0 || localX >= chunkSize || localZ < 0 || localZ >= chunkSize) return;
    for (let y = surface; y >= Math.max(1, surface - 8); y -= 1) {
      const current = chunk.getBlock(localX, y, localZ);
      if (current !== BlockId.Air && current !== BlockId.Water && current !== BlockId.Lava) break;
      chunk.setBlock(localX, y, localZ, structure.foundationBlock);
    }
  }

  /** Returns the persistent independent stream for one structure definition. */
  private getStream(id: string): NamedSeedStream {
    const existing = this.structureStreams.get(id);
    if (existing !== undefined) return existing;
    const definition = this.profile.structures.find((candidate) => candidate.id === id);
    const stream = this.streams.stream(`structure/${id}`, definition?.salt ?? 0);
    this.structureStreams.set(id, stream);
    return stream;
  }
}

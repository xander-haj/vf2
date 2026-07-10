/** Places shape-specific ores and deterministic surface decorations after terrain materials are resolved. */

import { BlockId } from "../../game/block-types";
import type { Chunk } from "../../world/chunk";
import type {
  DecorationDefinition,
  EngineBiomeDefinition,
  EngineWorldgenProfile,
  OreFeatureDefinition,
} from "./generation-context";
import type { NamedSeedStream, SeedStreamFactory } from "./seed-stream";

interface OreAnchor {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Returns whether a biome exposes any tag requested by a feature; an empty list means all biomes. */
function permitsBiome(required: readonly string[], biome: EngineBiomeDefinition): boolean {
  return required.length === 0 || required.some((tag) => tag === biome.id || biome.tags.includes(tag));
}

/** FeaturePlacer isolates each feature behind its own named coordinate-derived random stream. */
export class FeaturePlacer {
  private readonly oreStreams = new Map<string, NamedSeedStream>();
  private readonly decorationStreams = new Map<string, NamedSeedStream>();

  public constructor(
    private readonly streams: SeedStreamFactory,
    private readonly profile: EngineWorldgenProfile,
    private readonly chunkSize: number,
  ) {}

  /** Replaces eligible stone with the first matching configured ore feature. */
  public resolveOre(
    worldX: number,
    y: number,
    worldZ: number,
    current: BlockId,
    exposed: boolean,
    biome: EngineBiomeDefinition,
  ): BlockId {
    if (!this.isReplaceable(current)) return current;
    for (const ore of this.profile.ores) {
      if (
        y < ore.minimumY ||
        y > ore.maximumY ||
        (exposed && ore.exposure === "discard") ||
        !permitsBiome(ore.biomeTags, biome)
      ) {
        continue;
      }
      const stream = this.getOreStream(ore.id);
      if (this.matchesOre(worldX, y, worldZ, ore, stream)) {
        return current === BlockId.Deepslate ? ore.deepBlock : ore.block;
      }
    }
    return current;
  }

  /** Places configured trees, boulders, and columns, scanning neighboring roots for seamless chunk edges. */
  public placeDecorations(
    chunk: Chunk,
    getSurfaceHeight: (worldX: number, worldZ: number) => number,
    getBiome: (worldX: number, worldZ: number) => EngineBiomeDefinition,
  ): void {
    for (const feature of this.profile.decorations) {
      const stream = this.getDecorationStream(feature.id);
      const scanRadius = Math.max(1, feature.radius);
      const minChunkX = chunk.chunkX - Math.ceil(scanRadius / this.chunkSize);
      const maxChunkX = chunk.chunkX + Math.ceil(scanRadius / this.chunkSize);
      const minChunkZ = chunk.chunkZ - Math.ceil(scanRadius / this.chunkSize);
      const maxChunkZ = chunk.chunkZ + Math.ceil(scanRadius / this.chunkSize);
      for (let rootChunkZ = minChunkZ; rootChunkZ <= maxChunkZ; rootChunkZ += 1) {
        for (let rootChunkX = minChunkX; rootChunkX <= maxChunkX; rootChunkX += 1) {
          for (let attempt = 0; attempt < feature.attemptsPerChunk; attempt += 1) {
            const root = this.decorationRoot(rootChunkX, rootChunkZ, attempt, stream);
            if (stream.sampleUnit(root.x, 0, root.z, attempt + 401) >= feature.chance) continue;
            const biome = getBiome(root.x, root.z);
            if (!permitsBiome(feature.biomeTags, biome)) continue;
            const surface = getSurfaceHeight(root.x, root.z);
            this.placeDecoration(chunk, root.x, surface, root.z, feature, stream, attempt);
          }
        }
      }
    }
  }

  /** Checks anchors in neighboring chunks so every supported ore shape crosses boundaries exactly. */
  private matchesOre(
    worldX: number,
    y: number,
    worldZ: number,
    ore: OreFeatureDefinition,
    stream: NamedSeedStream,
  ): boolean {
    const chunkRadius = Math.ceil((ore.radius + ore.size) / this.chunkSize);
    const centerChunkX = Math.floor(worldX / this.chunkSize);
    const centerChunkZ = Math.floor(worldZ / this.chunkSize);
    for (let chunkZ = centerChunkZ - chunkRadius; chunkZ <= centerChunkZ + chunkRadius; chunkZ += 1) {
      for (let chunkX = centerChunkX - chunkRadius; chunkX <= centerChunkX + chunkRadius; chunkX += 1) {
        for (let attempt = 0; attempt < ore.attemptsPerChunk; attempt += 1) {
          const anchor = this.oreAnchor(chunkX, chunkZ, attempt, ore, stream);
          if (stream.sampleUnit(chunkX, attempt, chunkZ, 17) >= ore.chance) continue;
          if (ore.distribution === "noise-gated" && stream.noise2d(anchor.x / 24, anchor.z / 24) < 0.15) {
            continue;
          }
          if (this.matchesShape(worldX, y, worldZ, anchor, ore, stream, attempt)) return true;
        }
      }
    }
    return false;
  }

  /** Evaluates scatter, blob, sheet, stratum, and vein geometry with their distinct controls. */
  private matchesShape(
    x: number,
    y: number,
    z: number,
    anchor: OreAnchor,
    ore: OreFeatureDefinition,
    stream: NamedSeedStream,
    attempt: number,
  ): boolean {
    const dx = x - anchor.x;
    const dy = y - anchor.y;
    const dz = z - anchor.z;
    const radius = Math.max(1, ore.radius);
    if (ore.shape === "scatter") {
      if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) > radius) return false;
      const volume = (radius * 2 + 1) ** 3;
      return stream.sampleUnit(x, y, z, attempt + 101) < Math.min(1, ore.size / volume);
    }
    if (ore.shape === "blob") {
      const distortion = stream.noise3d(x / 3.2, y / 3.2, z / 3.2) * 0.28;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) / radius + distortion <= 1;
    }
    if (ore.shape === "sheet") {
      const tilt = stream.noise2d(x / 18, z / 18) * Math.max(1, ore.size / 4);
      return Math.abs(dy - tilt) <= 1 && Math.hypot(dx, dz) <= radius;
    }
    if (ore.shape === "stratum") {
      const wave = stream.noise2d(x / 26, z / 26) * Math.max(1, ore.size / 3);
      return (
        Math.hypot(dx, dz) <= Math.max(ore.radius, ore.size) &&
        Math.abs(dy - wave) <= Math.max(1, ore.radius / 3)
      );
    }
    return this.matchesVein(x, y, z, anchor, ore, stream, attempt);
  }

  /** Walks a deterministic segmented centerline and tests distance to produce branching-looking veins. */
  private matchesVein(
    x: number,
    y: number,
    z: number,
    anchor: OreAnchor,
    ore: OreFeatureDefinition,
    stream: NamedSeedStream,
    attempt: number,
  ): boolean {
    let centerX = anchor.x;
    let centerY = anchor.y;
    let centerZ = anchor.z;
    const thickness = Math.max(1, ore.radius / 3);
    for (let segment = 0; segment < ore.size; segment += 1) {
      if (Math.hypot(x - centerX, y - centerY, z - centerZ) <= thickness) return true;
      centerX += Math.floor(stream.sampleUnit(anchor.x, segment, anchor.z, attempt + 211) * 3) - 1;
      centerY += Math.floor(stream.sampleUnit(anchor.x, segment, anchor.z, attempt + 223) * 3) - 1;
      centerZ += Math.floor(stream.sampleUnit(anchor.x, segment, anchor.z, attempt + 227) * 3) - 1;
    }
    return false;
  }

  /** Derives one attempt anchor from chunk coordinates without consuming mutable random state. */
  private oreAnchor(
    chunkX: number,
    chunkZ: number,
    attempt: number,
    ore: OreFeatureDefinition,
    stream: NamedSeedStream,
  ): OreAnchor {
    const ySpan = ore.maximumY - ore.minimumY + 1;
    const first = stream.sampleUnit(chunkX, attempt, chunkZ, 37);
    const second = stream.sampleUnit(chunkX, attempt, chunkZ, 41);
    let yUnit = first;
    if (ore.distribution === "triangular") yUnit = (first + second) / 2;
    if (ore.distribution === "gaussian") {
      let sum = first + second;
      for (let sample = 0; sample < 4; sample += 1) {
        sum += stream.sampleUnit(chunkX, attempt, chunkZ, 47 + sample);
      }
      yUnit = sum / 6;
    }
    if (ore.distribution === "fixed-grid") {
      yUnit = (attempt + 0.5) / Math.max(1, ore.attemptsPerChunk);
    }
    const fixedOffset = Math.floor(this.chunkSize / 2);
    const localX = ore.distribution === "fixed-grid"
      ? fixedOffset
      : Math.min(
        this.chunkSize - 1,
        Math.floor(stream.sampleUnit(chunkX, attempt, chunkZ, 31) * this.chunkSize),
      );
    const localZ = ore.distribution === "fixed-grid"
      ? fixedOffset
      : Math.min(
        this.chunkSize - 1,
        Math.floor(stream.sampleUnit(chunkX, attempt, chunkZ, 43) * this.chunkSize),
      );
    return {
      x: chunkX * this.chunkSize + localX,
      y: ore.minimumY + Math.min(ySpan - 1, Math.floor(yUnit * ySpan)),
      z: chunkZ * this.chunkSize + localZ,
    };
  }

  /** Derives a surface-feature root within its attempt chunk. */
  private decorationRoot(
    chunkX: number,
    chunkZ: number,
    attempt: number,
    stream: NamedSeedStream,
  ): OreAnchor {
    return {
      x: chunkX * this.chunkSize + Math.min(
        this.chunkSize - 1,
        Math.floor(stream.sampleUnit(chunkX, attempt, chunkZ, 307) * this.chunkSize),
      ),
      y: 0,
      z: chunkZ * this.chunkSize + Math.min(
        this.chunkSize - 1,
        Math.floor(stream.sampleUnit(chunkX, attempt, chunkZ, 311) * this.chunkSize),
      ),
    };
  }

  /** Emits one complete configured decoration while respecting the current target chunk. */
  private placeDecoration(
    chunk: Chunk,
    rootX: number,
    surface: number,
    rootZ: number,
    feature: DecorationDefinition,
    stream: NamedSeedStream,
    attempt: number,
  ): void {
    const height = feature.minimumHeight + Math.floor(
      stream.sampleUnit(rootX, surface, rootZ, attempt + 503) * Math.max(1, feature.heightRange),
    );
    if (feature.kind === "tree") {
      for (let y = 1; y <= height; y += 1) this.setIfAir(chunk, rootX, surface + y, rootZ, feature.block);
      for (let dy = -1; dy <= 1; dy += 1) {
        const radius = dy === 1 ? Math.max(1, feature.radius - 1) : feature.radius;
        for (let dz = -radius; dz <= radius; dz += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
            this.setIfAir(chunk, rootX + dx, surface + height + dy, rootZ + dz, feature.secondaryBlock);
          }
        }
      }
      return;
    }
    if (feature.kind === "column") {
      for (let y = 1; y <= height; y += 1) this.setIfAir(chunk, rootX, surface + y, rootZ, feature.block);
      return;
    }
    for (let dy = 0; dy <= feature.radius; dy += 1) {
      const radius = Math.max(0, feature.radius - dy);
      for (let dz = -radius; dz <= radius; dz += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dz * dz > radius * radius) continue;
          this.setIfAir(chunk, rootX + dx, surface + 1 + dy, rootZ + dz, feature.block);
        }
      }
    }
  }

  /** Writes an absolute coordinate only when it is air inside the target chunk. */
  private setIfAir(chunk: Chunk, worldX: number, y: number, worldZ: number, block: BlockId): void {
    const localX = worldX - chunk.chunkX * this.chunkSize;
    const localZ = worldZ - chunk.chunkZ * this.chunkSize;
    if (localX < 0 || localX >= this.chunkSize || localZ < 0 || localZ >= this.chunkSize) return;
    if (y < 0 || y >= chunk.dimensions.worldHeight) return;
    if (chunk.getBlock(localX, y, localZ) === BlockId.Air) chunk.setBlock(localX, y, localZ, block);
  }

  /** Limits ore replacement to natural stone families. */
  private isReplaceable(block: BlockId): boolean {
    return block === BlockId.Stone || block === BlockId.Deepslate || block === BlockId.Tuff;
  }

  /** Returns the persistent named stream for one ore definition. */
  private getOreStream(id: string): NamedSeedStream {
    const existing = this.oreStreams.get(id);
    if (existing !== undefined) return existing;
    const definition = this.profile.ores.find((candidate) => candidate.id === id);
    const stream = this.streams.stream(`ore/${id}`, definition?.salt ?? 0);
    this.oreStreams.set(id, stream);
    return stream;
  }

  /** Returns the persistent named stream for one decoration definition. */
  private getDecorationStream(id: string): NamedSeedStream {
    const existing = this.decorationStreams.get(id);
    if (existing !== undefined) return existing;
    const definition = this.profile.decorations.find((candidate) => candidate.id === id);
    const stream = this.streams.stream(`decoration/${id}`, definition?.salt ?? 0);
    this.decorationStreams.set(id, stream);
    return stream;
  }
}

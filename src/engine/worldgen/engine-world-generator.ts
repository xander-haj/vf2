/** Executes the ordered engine-v2 terrain, cave, aquifer, surface, ore, structure, and feature passes. */

import { BlockId } from "../../game/block-types";
import { Chunk } from "../../world/chunk";
import { AquiferResolver } from "./aquifer-resolver";
import { CaveCarver } from "./cave-carver";
import { ClimateSampler } from "./climate-sampler";
import { DensitySampler } from "./density-sampler";
import { FeaturePlacer } from "./feature-placer";
import {
  GenerationContext,
  type EngineBiomeDefinition,
  type EngineWorldgenProfile,
} from "./generation-context";
import { StructurePlacer } from "./structure-placer";
import { SurfaceResolver } from "./surface-resolver";

/** CoordinatePassResult records the exact block after one ordered generation pass. */
export interface CoordinatePassResult {
  readonly pass: "terrain" | "ores" | "structures" | "decorations";
  readonly block: BlockId;
}

/** CoordinateGenerationExplanation provides editor-ready evidence for one generated coordinate. */
export interface CoordinateGenerationExplanation {
  readonly worldX: number;
  readonly y: number;
  readonly worldZ: number;
  readonly biomeId: string;
  readonly climate: ReturnType<ClimateSampler["sample"]>;
  readonly surfaceHeight: number;
  readonly densityBaseHeight: number;
  readonly density: number;
  readonly caveCarved: boolean;
  readonly passes: readonly CoordinatePassResult[];
}

/** EngineWorldGenerator owns every deterministic pass for a single saved seed and profile. */
export class EngineWorldGenerator {
  private readonly context: GenerationContext;
  private readonly climate: ClimateSampler;
  private readonly density: DensitySampler;
  private readonly caves: CaveCarver;
  private readonly aquifers: AquiferResolver;
  private readonly surfaces: SurfaceResolver;
  private readonly features: FeaturePlacer;
  private readonly structures: StructurePlacer;

  public constructor(
    seed: number,
    private readonly profile: EngineWorldgenProfile,
    private readonly chunkSize: number,
    private readonly worldHeight: number,
    private readonly sectionHeight: number,
  ) {
    this.context = new GenerationContext(seed, profile);
    this.climate = new ClimateSampler(this.context.streams, profile);
    this.density = new DensitySampler(this.context.streams, profile, worldHeight);
    this.caves = new CaveCarver(this.context.streams, profile);
    this.aquifers = new AquiferResolver(this.context.streams, profile, {
      air: BlockId.Air,
      water: BlockId.Water,
      lava: BlockId.Lava,
    });
    this.surfaces = new SurfaceResolver(this.context.streams, profile);
    this.features = new FeaturePlacer(this.context.streams, profile, chunkSize);
    this.structures = new StructurePlacer(this.context.streams, profile);
  }

  /** Returns the deterministic biome definition at an absolute horizontal coordinate. */
  public getBiome(worldX: number, worldZ: number): EngineBiomeDefinition {
    return this.climate.selectBiome(this.climate.sample(worldX, worldZ));
  }

  /** Returns the highest density surface after volumetric overhangs for spawn and surface placement. */
  public getTerrainHeight(worldX: number, worldZ: number): number {
    const nominal = this.getDensityBaseHeight(worldX, worldZ);
    const maximumOverhang = Math.ceil(
      this.profile.terrain.overhangStrength / this.profile.terrain.verticalGradient,
    ) + 2;
    const maximumY = Math.min(this.worldHeight - 1, nominal + maximumOverhang);
    const minimumY = Math.max(1, nominal - maximumOverhang);
    for (let y = maximumY; y >= minimumY; y -= 1) {
      if (this.isSolid(worldX, y, worldZ, nominal)) return y;
    }
    return minimumY;
  }

  /** Returns the two-dimensional reference height consumed by the volumetric density field. */
  private getDensityBaseHeight(worldX: number, worldZ: number): number {
    const climate = this.climate.sample(worldX, worldZ);
    const biome = this.climate.selectBiome(climate);
    return this.density.getSurfaceHeight(worldX, worldZ, climate, biome);
  }

  /** Populates one chunk using the profile-defined stable pass order. */
  public generateChunk(chunk: Chunk): void {
    this.generateTerrainAndFluids(chunk);
    this.replaceOres(chunk);
    this.structures.placeStructures(
      chunk,
      (x, z) => this.getTerrainHeight(x, z),
      (x, z) => this.getBiome(x, z),
    );
    this.features.placeDecorations(
      chunk,
      (x, z) => this.getTerrainHeight(x, z),
      (x, z) => this.getBiome(x, z),
    );
  }

  /** Replays ordered passes in an isolated chunk and explains their exact result at one coordinate. */
  public explainCoordinate(worldX: number, y: number, worldZ: number): CoordinateGenerationExplanation {
    if (!Number.isInteger(y) || y < 0 || y >= this.worldHeight) {
      throw new Error(`Generation explanation Y must be an integer from 0 through ${this.worldHeight - 1}.`);
    }
    const chunkX = Math.floor(worldX / this.chunkSize);
    const chunkZ = Math.floor(worldZ / this.chunkSize);
    const localX = worldX - chunkX * this.chunkSize;
    const localZ = worldZ - chunkZ * this.chunkSize;
    const chunk = new Chunk(chunkX, chunkZ, {
      chunkSize: this.chunkSize,
      worldHeight: this.worldHeight,
      sectionHeight: this.sectionHeight,
    });
    const climate = this.climate.sample(worldX, worldZ);
    const biome = this.climate.selectBiome(climate);
    const densityBaseHeight = this.density.getSurfaceHeight(worldX, worldZ, climate, biome);
    const surfaceHeight = this.getTerrainHeight(worldX, worldZ);
    const density = this.density.sampleDensity(worldX, y, worldZ, densityBaseHeight);
    const caveCarved = density > 0 && this.caves.shouldCarve(worldX, y, worldZ, densityBaseHeight);
    const passes: CoordinatePassResult[] = [];
    this.generateTerrainAndFluids(chunk);
    passes.push({ pass: "terrain", block: chunk.getBlock(localX, y, localZ) });
    this.replaceOres(chunk);
    passes.push({ pass: "ores", block: chunk.getBlock(localX, y, localZ) });
    this.structures.placeStructures(
      chunk,
      (x, z) => this.getTerrainHeight(x, z),
      (x, z) => this.getBiome(x, z),
    );
    passes.push({ pass: "structures", block: chunk.getBlock(localX, y, localZ) });
    this.features.placeDecorations(
      chunk,
      (x, z) => this.getTerrainHeight(x, z),
      (x, z) => this.getBiome(x, z),
    );
    passes.push({ pass: "decorations", block: chunk.getBlock(localX, y, localZ) });
    return {
      worldX,
      y,
      worldZ,
      biomeId: biome.id,
      climate,
      surfaceHeight,
      densityBaseHeight,
      density,
      caveCarved,
      passes,
    };
  }

  /** Establishes density solids, cave cavities, aquifer fluids, and biome surface materials. */
  private generateTerrainAndFluids(chunk: Chunk): void {
    const startX = chunk.chunkX * this.chunkSize;
    const startZ = chunk.chunkZ * this.chunkSize;
    for (let localZ = 0; localZ < this.chunkSize; localZ += 1) {
      for (let localX = 0; localX < this.chunkSize; localX += 1) {
        const worldX = startX + localX;
        const worldZ = startZ + localZ;
        const climate = this.climate.sample(worldX, worldZ);
        const biome = this.climate.selectBiome(climate);
        const surface = this.density.getSurfaceHeight(worldX, worldZ, climate, biome);
        for (let y = 0; y < this.worldHeight; y += 1) {
          const solid = this.isSolid(worldX, y, worldZ, surface);
          if (!solid) {
            const ocean = y > surface && y <= this.profile.seaLevel;
            const block = ocean ? BlockId.Water : this.aquifers.resolveCavity(worldX, y, worldZ);
            chunk.setBlock(localX, y, localZ, block);
            continue;
          }
          const exposedAbove = !this.isSolid(worldX, y + 1, worldZ, surface);
          const block = this.surfaces.resolveSolid(worldX, y, worldZ, surface, biome, exposedAbove);
          chunk.setBlock(localX, y, localZ, block);
        }
      }
    }
  }

  /** Applies configured ore shapes only after the stable base geology and cavity field exist. */
  private replaceOres(chunk: Chunk): void {
    const startX = chunk.chunkX * this.chunkSize;
    const startZ = chunk.chunkZ * this.chunkSize;
    for (let localZ = 0; localZ < this.chunkSize; localZ += 1) {
      for (let localX = 0; localX < this.chunkSize; localX += 1) {
        const worldX = startX + localX;
        const worldZ = startZ + localZ;
        const biome = this.getBiome(worldX, worldZ);
        const surface = this.getDensityBaseHeight(worldX, worldZ);
        for (let y = 1; y < this.worldHeight - 1; y += 1) {
          const current = chunk.getBlock(localX, y, localZ);
          if (!this.isOreReplaceable(current)) continue;
          const exposed = this.isExposed(worldX, y, worldZ, surface);
          const ore = this.features.resolveOre(worldX, y, worldZ, current, exposed, biome);
          if (ore !== current) chunk.setBlock(localX, y, localZ, ore);
        }
      }
    }
  }

  /** Evaluates density and cave carving for a coordinate without relying on chunk load order. */
  private isSolid(worldX: number, y: number, worldZ: number, knownSurface?: number): boolean {
    if (y < 0) return true;
    if (y >= this.worldHeight) return false;
    if (y === 0) return true;
    const surface = knownSurface ?? this.getDensityBaseHeight(worldX, worldZ);
    const density = this.density.sampleDensity(worldX, y, worldZ, surface);
    return density > 0 && !this.caves.shouldCarve(worldX, y, worldZ, surface);
  }

  /** Reports whether an ore coordinate touches any natural cavity or terrain exterior. */
  private isExposed(worldX: number, y: number, worldZ: number, surface: number): boolean {
    return (
      !this.isSolid(worldX + 1, y, worldZ) ||
      !this.isSolid(worldX - 1, y, worldZ) ||
      !this.isSolid(worldX, y + 1, worldZ, surface) ||
      !this.isSolid(worldX, y - 1, worldZ, surface) ||
      !this.isSolid(worldX, y, worldZ + 1) ||
      !this.isSolid(worldX, y, worldZ - 1)
    );
  }

  /** Avoids costly ore exposure and anchor sampling for blocks no ore definition can replace. */
  private isOreReplaceable(block: BlockId): boolean {
    return block === BlockId.Stone || block === BlockId.Deepslate || block === BlockId.Tuff;
  }
}

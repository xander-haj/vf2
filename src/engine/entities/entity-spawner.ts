/**
 * Produces deterministic biome-aware entity groups as nearby chunks enter the simulation radius.
 * Spawn IDs and positions depend only on world seed, rule, chunk, and group index rather than frame order.
 */

import { Vector3 } from "three";
import type { EntityDefinition, EntitySpawnRule } from "./entity-model";
import { isEntityBodyClear } from "./entity-navigation";

/** EntitySpawnWorld exposes generation facts required by authored environmental rules. */
export interface EntitySpawnWorld {
  getSeed(): number;
  getSpawningSalt(): number;
  getChunkSize(): number;
  getTerrainHeight(worldX: number, worldZ: number): number;
  getBiomeId(worldX: number, worldZ: number): string;
  getSkyLight(worldX: number, y: number, worldZ: number): number;
  isSolid(worldX: number, y: number, worldZ: number): boolean;
}

/** SpawnRequest contains one deterministic instance identity and validated foot coordinate. */
export interface SpawnRequest {
  readonly id: string;
  readonly definition: EntityDefinition;
  readonly position: Vector3;
}

/** Produces a stable unsigned coordinate hash without shared sequential random state. */
function spawnHash(seed: number, key: string): number {
  let value = (seed ^ 2166136261) >>> 0;
  for (let index = 0; index < key.length; index += 1) {
    value ^= key.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  return (value ^ (value >>> 13)) >>> 0;
}

/** Converts one hash stream into an inclusive integer range. */
function rangedInteger(hash: number, minimum: number, maximum: number): number {
  const range = Math.max(1, maximum - minimum + 1);
  return minimum + (hash % range);
}

/** EntitySpawner tracks a bounded set of evaluated nearby chunks and applies complete authored rules. */
export class EntitySpawner {
  private readonly definitions: ReadonlyMap<string, EntityDefinition>;
  private readonly evaluated = new Map<string, number>();
  private evaluationSequence = 0;

  public constructor(
    definitions: readonly EntityDefinition[],
    private readonly rules: readonly EntitySpawnRule[],
  ) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  /** Evaluates newly nearby chunks and returns deterministic spawn requests not already present. */
  public update(
    world: EntitySpawnWorld,
    playerPosition: Vector3,
    occupiedIds: ReadonlySet<string>,
    populationByDefinition: ReadonlyMap<string, number>,
    radiusChunks: number,
  ): SpawnRequest[] {
    const chunkSize = world.getChunkSize();
    const centerX = Math.floor(playerPosition.x / chunkSize);
    const centerZ = Math.floor(playerPosition.z / chunkSize);
    const requests: SpawnRequest[] = [];
    const plannedPopulation = new Map(populationByDefinition);
    this.evaluationSequence += 1;

    // Stable square iteration and per-coordinate hashes keep results independent of frame timing.
    for (let offsetZ = -radiusChunks; offsetZ <= radiusChunks; offsetZ += 1) {
      for (let offsetX = -radiusChunks; offsetX <= radiusChunks; offsetX += 1) {
        const chunkX = centerX + offsetX;
        const chunkZ = centerZ + offsetZ;
        const key = `${chunkX},${chunkZ}`;
        if (this.evaluated.has(key)) {
          this.evaluated.set(key, this.evaluationSequence);
          continue;
        }
        this.evaluated.set(key, this.evaluationSequence);
        this.rules.forEach((rule) => {
          const definition = this.definitions.get(rule.entityId);
          const population = plannedPopulation.get(rule.entityId) ?? 0;
          if (definition === undefined || population >= rule.cap) {
            return;
          }
          const available = Math.max(0, rule.cap - population);
          const generated = this.evaluateRule(world, definition, rule, chunkX, chunkZ, occupiedIds)
            .slice(0, available);
          requests.push(...generated);
          plannedPopulation.set(rule.entityId, population + generated.length);
        });
      }
    }
    this.pruneEvaluatedChunks();
    return requests;
  }

  /** Applies probability, group size, positions, biome, height, light, and solid-ground conditions. */
  private evaluateRule(
    world: EntitySpawnWorld,
    definition: EntityDefinition,
    rule: EntitySpawnRule,
    chunkX: number,
    chunkZ: number,
    occupiedIds: ReadonlySet<string>,
  ): SpawnRequest[] {
    const seed = world.getSeed() ^ world.getSpawningSalt();
    const baseKey = `${rule.id}:${rule.salt}:${chunkX}:${chunkZ}`;
    const chance = spawnHash(seed, `${baseKey}:chance`) / 0x100000000;
    if (chance >= rule.weight) {
      return [];
    }
    const groupCount = rangedInteger(
      spawnHash(seed, `${baseKey}:group`),
      rule.groupSize[0],
      rule.groupSize[1],
    );
    const requests: SpawnRequest[] = [];
    const chunkSize = world.getChunkSize();
    for (let index = 0; index < groupCount; index += 1) {
      const id = `spawn:${baseKey}:${index}`;
      if (occupiedIds.has(id)) {
        continue;
      }
      const x = chunkX * chunkSize + spawnHash(seed, `${id}:x`) % chunkSize;
      const z = chunkZ * chunkSize + spawnHash(seed, `${id}:z`) % chunkSize;
      const surface = world.getTerrainHeight(x, z);
      const undergroundOffset = 3 + spawnHash(seed, `${id}:depth`) % 18;
      const y = rule.conditions.includes("underground") ? surface - undergroundOffset : surface + 1;
      if (!this.isEligible(world, definition, rule, x, y, z)) {
        continue;
      }
      requests.push({ id, definition, position: new Vector3(x + 0.5, y, z + 0.5) });
    }
    return requests;
  }

  /** Validates all environmental conditions for one candidate foot coordinate. */
  private isEligible(
    world: EntitySpawnWorld,
    definition: EntityDefinition,
    rule: EntitySpawnRule,
    x: number,
    y: number,
    z: number,
  ): boolean {
    if (y < rule.minY || y > rule.maxY || !rule.biomes.includes(world.getBiomeId(x, z))) {
      return false;
    }
    const light = world.getSkyLight(x, y, z);
    if (light < rule.lightRange[0] || light > rule.lightRange[1]) {
      return false;
    }
    if (
      !world.isSolid(x, y - 1, z)
      || !isEntityBodyClear(
        world,
        x + 0.5,
        y,
        z + 0.5,
        definition.dimensions.width,
        definition.dimensions.height,
      )
    ) {
      return false;
    }
    if (rule.conditions.includes("requires_sky") && light < 1) {
      return false;
    }
    return true;
  }

  /** Bounds remembered chunk evaluations while retaining every chunk near the current player. */
  private pruneEvaluatedChunks(): void {
    if (this.evaluated.size <= 256) {
      return;
    }
    const oldest = [...this.evaluated.entries()]
      .sort((left, right) => left[1] - right[1])
      .slice(0, this.evaluated.size - 256);
    oldest.forEach(([key]) => this.evaluated.delete(key));
  }
}

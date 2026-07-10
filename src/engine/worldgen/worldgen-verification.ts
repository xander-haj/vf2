/** Runs deterministic golden-coordinate, replay, and generation-order checks against engine-v2. */

import { BlockId } from "../../game/block-types";
import { ENGINE_WORLDGEN_PROFILE } from "../../generated/engine-worldgen-registry";
import { Chunk } from "../../world/chunk";
import { EngineWorldGenerator } from "./engine-world-generator";

const DIMENSIONS = { chunkSize: 16, worldHeight: 128, sectionHeight: 16 } as const;

/** GoldenCoordinate fixes a seed/coordinate result that no later pass may silently change. */
interface GoldenCoordinate {
  readonly seed: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly expected: BlockId;
}

// The bottom density row is an exact, pass-stable bedrock invariant across varied signed seed inputs.
const GOLDEN_COORDINATES: readonly GoldenCoordinate[] = [
  { seed: 0, x: 0, y: 0, z: 0, expected: BlockId.Bedrock },
  { seed: 1, x: 15, y: 0, z: 15, expected: BlockId.Bedrock },
  { seed: -1, x: -1, y: 0, z: -1, expected: BlockId.Bedrock },
  { seed: 2_147_483_647, x: 32, y: 0, z: -32, expected: BlockId.Bedrock },
];

/** WorldgenVerificationResult contains actionable failures without throwing away later checks. */
export interface WorldgenVerificationResult {
  readonly passed: boolean;
  readonly diagnostics: readonly string[];
}

/** Creates one production generator using the same dimensions as the persisted engine-v2 profile. */
function generator(seed: number): EngineWorldGenerator {
  return new EngineWorldGenerator(
    seed,
    ENGINE_WORLDGEN_PROFILE,
    DIMENSIONS.chunkSize,
    DIMENSIONS.worldHeight,
    DIMENSIONS.sectionHeight,
  );
}

/** Produces one stable hash from every block in a generated chunk. */
function chunkHash(chunk: Chunk): number {
  let hash = 2166136261;
  for (let y = 0; y < DIMENSIONS.worldHeight; y += 1) {
    for (let z = 0; z < DIMENSIONS.chunkSize; z += 1) {
      for (let x = 0; x < DIMENSIONS.chunkSize; x += 1) {
        hash ^= chunk.getBlock(x, y, z);
        hash = Math.imul(hash, 16777619);
      }
    }
  }
  return hash >>> 0;
}

/** Generates a requested chunk through the complete ordered production pipeline. */
function generateChunk(source: EngineWorldGenerator, chunkX: number, chunkZ: number): Chunk {
  const chunk = new Chunk(chunkX, chunkZ, DIMENSIONS);
  source.generateChunk(chunk);
  return chunk;
}

/** Executes all deterministic verification cases and returns every exact failure. */
export function verifyEngineWorldgen(): WorldgenVerificationResult {
  const diagnostics: string[] = [];
  for (const fixture of GOLDEN_COORDINATES) {
    const explanation = generator(fixture.seed).explainCoordinate(fixture.x, fixture.y, fixture.z);
    const actual = explanation.passes.at(-1)?.block;
    if (actual !== fixture.expected) {
      diagnostics.push(
        `Golden seed ${fixture.seed} at ${fixture.x},${fixture.y},${fixture.z}: `
        + `expected ${fixture.expected}, received ${String(actual)}.`,
      );
    }
  }

  // Independent generators requested in opposite orders must create byte-identical chunk snapshots.
  const forward = generator(0x5eed1234);
  const forwardLeft = chunkHash(generateChunk(forward, -1, 0));
  const forwardRight = chunkHash(generateChunk(forward, 0, 0));
  const reverse = generator(0x5eed1234);
  const reverseRight = chunkHash(generateChunk(reverse, 0, 0));
  const reverseLeft = chunkHash(generateChunk(reverse, -1, 0));
  if (forwardLeft !== reverseLeft || forwardRight !== reverseRight) {
    diagnostics.push("Chunk generation changed with request order for seed 0x5eed1234.");
  }

  // Coordinate replay must agree with the final block written by the matching full chunk pipeline.
  const replayGenerator = generator(0x13579bdf);
  const replayChunk = generateChunk(replayGenerator, 0, 0);
  for (const [x, y, z] of [[2, 24, 3], [8, 48, 8], [13, 72, 11]] as const) {
    const explained = replayGenerator.explainCoordinate(x, y, z).passes.at(-1)?.block;
    if (explained !== replayChunk.getBlock(x, y, z)) {
      diagnostics.push(`Coordinate replay diverged from chunk output at ${x},${y},${z}.`);
    }
  }
  return { passed: diagnostics.length === 0, diagnostics };
}

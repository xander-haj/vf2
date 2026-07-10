/** Resolves deterministic underground fluid tables and lava pockets after cave carving. */

import type { BlockId } from "../../game/block-types";
import type { EngineWorldgenProfile } from "./generation-context";
import type { NamedSeedStream, SeedStreamFactory } from "./seed-stream";

/** AquiferBlocks decouples generated fluid logic from append-only numeric block assignment. */
export interface AquiferBlocks {
  readonly air: BlockId;
  readonly water: BlockId;
  readonly lava: BlockId;
}

/** AquiferResolver fills only cavities whose local water table and pressure permit fluid. */
export class AquiferResolver {
  private readonly table: NamedSeedStream;
  private readonly pressure: NamedSeedStream;
  private readonly lava: NamedSeedStream;

  public constructor(
    streams: SeedStreamFactory,
    private readonly profile: EngineWorldgenProfile,
    private readonly blocks: AquiferBlocks,
  ) {
    this.table = streams.stream("aquifers/water-table");
    this.pressure = streams.stream("aquifers/pressure");
    this.lava = streams.stream("aquifers/lava");
  }

  /** Returns air or the appropriate fluid for a carved or naturally open underground coordinate. */
  public resolveCavity(worldX: number, y: number, worldZ: number): BlockId {
    if (!this.profile.aquifers.enabled) {
      return this.blocks.air;
    }
    if (y <= this.profile.lavaLevel) {
      const lavaSample = this.lava.sampleUnit(worldX, y, worldZ);
      if (lavaSample < this.profile.aquifers.lavaChance) {
        return this.blocks.lava;
      }
    }
    const tableVariation = this.table.fractal2d(worldX / 48, worldZ / 48, 2);
    const tableHeight = Math.floor(
      this.profile.seaLevel + tableVariation * this.profile.aquifers.waterTableVariation,
    );
    if (y > tableHeight) {
      return this.blocks.air;
    }
    const pressureScale = this.profile.aquifers.pressureScale;
    const pressure = this.pressure.noise3d(worldX / pressureScale, y / pressureScale, worldZ / pressureScale);
    return pressure > -0.35 ? this.blocks.water : this.blocks.air;
  }
}

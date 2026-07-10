/** Applies deterministic cheese caverns and intersected-noise tunnels below protected surfaces. */

import type { EngineWorldgenProfile } from "./generation-context";
import type { NamedSeedStream, SeedStreamFactory } from "./seed-stream";

/** CaveCarver decides whether an otherwise solid coordinate becomes an underground cavity. */
export class CaveCarver {
  private readonly cheese: NamedSeedStream;
  private readonly tunnelA: NamedSeedStream;
  private readonly tunnelB: NamedSeedStream;

  public constructor(
    streams: SeedStreamFactory,
    private readonly profile: EngineWorldgenProfile,
  ) {
    this.cheese = streams.stream("caves/cheese");
    this.tunnelA = streams.stream("caves/tunnel-a");
    this.tunnelB = streams.stream("caves/tunnel-b");
  }

  /** Returns true when cave fields carve this solid coordinate without breaching the protected surface. */
  public shouldCarve(worldX: number, y: number, worldZ: number, surfaceHeight: number): boolean {
    const caves = this.profile.caves;
    if (y < caves.minimumY || y > caves.maximumY || y > surfaceHeight - caves.surfaceClearance) {
      return false;
    }
    const depth = surfaceHeight - y;
    const boundaryFade = Math.min(1, depth / 14) * Math.min(1, (y - caves.minimumY + 1) / 6);
    const cheese = this.cheese.fractal3d(
      worldX / caves.cheeseScale,
      y / caves.cheeseScale,
      worldZ / caves.cheeseScale,
      3,
    );
    if (cheese > caves.cheeseThreshold + (1 - boundaryFade) * 0.2) {
      return true;
    }
    const tunnelScale = caves.tunnelScale;
    const first = Math.abs(this.tunnelA.fractal3d(worldX / tunnelScale, y / 19, worldZ / tunnelScale, 2));
    const second = Math.abs(this.tunnelB.fractal3d(worldX / 23, y / tunnelScale, worldZ / 23, 2));
    return Math.max(first, second) < caves.tunnelThreshold * boundaryFade;
  }
}

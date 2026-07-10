/** Samples continuous climate fields and selects the closest eligible generated biome. */

import type {
  ClimateSample,
  EngineBiomeDefinition,
  EngineWorldgenProfile,
} from "./generation-context";
import type { NamedSeedStream, SeedStreamFactory } from "./seed-stream";

/** Measures how far a sample lies outside an inclusive interval. */
function rangeDistance(value: number, minimum: number, maximum: number): number {
  if (value < minimum) return minimum - value;
  if (value > maximum) return value - maximum;
  return 0;
}

/** ClimateSampler owns independently salted continuous fields and deterministic biome classification. */
export class ClimateSampler {
  private readonly continental: NamedSeedStream;
  private readonly erosion: NamedSeedStream;
  private readonly temperature: NamedSeedStream;
  private readonly humidity: NamedSeedStream;
  private readonly weirdness: NamedSeedStream;

  public constructor(
    streams: SeedStreamFactory,
    private readonly profile: EngineWorldgenProfile,
  ) {
    this.continental = streams.stream("climate/continentalness");
    this.erosion = streams.stream("climate/erosion");
    this.temperature = streams.stream("climate/temperature");
    this.humidity = streams.stream("climate/humidity");
    this.weirdness = streams.stream("climate/weirdness");
  }

  /** Returns broad climate values at an absolute horizontal coordinate. */
  public sample(worldX: number, worldZ: number): ClimateSample {
    const continentScale = this.profile.terrain.continentScale;
    const erosionScale = this.profile.terrain.erosionScale;
    return {
      continentalness: this.continental.fractal2d(worldX / continentScale, worldZ / continentScale, 4),
      erosion: this.erosion.fractal2d(worldX / erosionScale, worldZ / erosionScale, 3),
      temperature: this.temperature.fractal2d(
        worldX / this.profile.climate.temperatureScale,
        worldZ / this.profile.climate.temperatureScale,
        this.profile.climate.octaves,
      ),
      humidity: this.humidity.fractal2d(
        worldX / this.profile.climate.humidityScale,
        worldZ / this.profile.climate.humidityScale,
        this.profile.climate.octaves,
      ),
      weirdness: this.weirdness.fractal2d(
        worldX / this.profile.climate.weirdnessScale,
        worldZ / this.profile.climate.weirdnessScale,
        Math.max(1, this.profile.climate.octaves - 1),
      ),
    };
  }

  /** Selects the least-distant biome, using declaration order as the stable tie breaker. */
  public selectBiome(climate: ClimateSample): EngineBiomeDefinition {
    const first = this.profile.biomes[0];
    if (first === undefined) {
      throw new Error("Engine world-generation profiles must define at least one biome.");
    }
    let selected = first;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const biome of this.profile.biomes) {
      const distance =
        rangeDistance(climate.temperature, biome.temperature.minimum, biome.temperature.maximum) ** 2 +
        rangeDistance(climate.humidity, biome.humidity.minimum, biome.humidity.maximum) ** 2 +
        rangeDistance(
          climate.continentalness,
          biome.continentalness.minimum,
          biome.continentalness.maximum,
        ) ** 2;
      if (distance < selectedDistance) {
        selected = biome;
        selectedDistance = distance;
      }
    }
    return selected;
  }
}

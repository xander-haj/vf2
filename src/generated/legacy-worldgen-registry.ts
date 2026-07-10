/**
 * Generated from legacy canonical world-generation files and retained for compatibility tooling.
 * The executable vf:legacy_v1 algorithm remains frozen in the existing runtime implementation.
 */

import biomeSource from "../../content/worldgen/biomes/legacy-biomes.json";
import featureSource from "../../content/worldgen/features/legacy-features.json";
import profileSource from "../../content/worldgen/profiles/legacy-v1.json";

/** LEGACY_WORLDGEN_REGISTRY exposes exact authored inputs without reinterpreting old saved seeds. */
export const LEGACY_WORLDGEN_REGISTRY = {
  profile: profileSource,
  biomeSet: biomeSource,
  featureSet: featureSource,
} as const;

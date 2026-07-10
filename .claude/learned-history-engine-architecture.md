# Learned History — Engine Architecture

This file stores durable engine, asset-pipeline, entity-system, and terrain-generation findings for this task area.

## Confirmed Runtime Architecture

- `index.html` loads `src/main.ts`; `main.ts` creates `Game`; `Game` directly constructs every runtime subsystem and
  is the sole frame-loop owner.
- `World` is the authoritative block boundary for streaming, generation, meshing, collision queries, player edits,
  sparse persistence, and cleanup. It keeps a fixed five-by-five square of 16-by-64-by-16 chunks resident.
- The seed regenerates untouched chunks. `WorldStorage` persists only schema version 1, one numeric seed, and a sparse
  coordinate-to-byte block-edit map in browser local storage.
- Block IDs are append-only numeric bytes. Block behavior, names, face textures, colors, texture recipes, and the
  seven-slot hotbar are compiled TypeScript records or arrays rather than external content data.
- Block artwork is generated into a browser canvas atlas at startup. There is no asset directory, asset manifest,
  importer, stable asset URI scheme, model format, animation format, or binary optimization pipeline.
- The only simulated actor is the player. There is no general entity identity, component, behavior, navigation,
  animation, spawning, serialization, or lifecycle system for NPCs and enemies.

## Confirmed Generation Boundary

- `WorldGenerator` owns one hard-coded pipeline: two-dimensional height noise, biome surface strata, underground
  geology, then deterministic trees.
- Biomes are hard-coded climate thresholds over temperature, moisture, variation, and terrain height. Geology is a
  priority-ordered set of depth checks and coordinate samples for bedrock, ores, and rock families.
- Current generation has no external seed preset, generator graph, biome registry, configurable block clusters,
  three-dimensional density terrain, caves, water, lava, structures, or saved generator-version identifier.
- `WorldGenerator.getGeneratedBlock` regenerates a complete temporary chunk for each edited coordinate so sparse
  storage can omit edits that match generated terrain.

## Editor-Relevant Constraints

- There is no safe GUI-to-code round-trip boundary: authorable values are mixed with handwritten runtime logic.
- The renderer supports opaque cube blocks sharing one atlas material; it does not yet support independent models,
  animated entities, transparent material groups, or content-authored render components.
- Existing saved worlds depend on unchanged block ID meanings and generation behavior. Engine migration must preserve
  legacy IDs and explicitly version generation profiles before terrain controls can change existing seed output.
- The current static Vite/GitHub Pages deployment has no backend, filesystem write access, or editor process. A GUI
  that saves source files must therefore be a local development tool, not functionality inside the deployed game.

## Research-Backed Engine Direction

- Canonical versioned content must be the editor source of truth; a deterministic compiler produces runtime TypeScript
  registries. The editor must never parse and rewrite arbitrary handwritten code.
- World compatibility is defined by world seed, generator version, world profile ID, and content registry version.
  Existing schema-version-1 saves require a frozen legacy generator profile.
- Named, coordinate-derived random streams isolate terrain and features so adding one feature cannot reshuffle every
  previously generated ore, tree, structure, or decoration for the same seed.
- A complete generator uses ordered terrain, biome, surface, geology, structure, feature, and spawn passes. Each pass
  and subsystem salt is persisted compatibility data.
- Ore and decoration controls must be shape-specific. Scatter clusters, blobs, sheets, strata, and noise-intersection
  veins do not share one meaningful universal cluster-size model.
- Entity content should compose typed components and behavior nodes. Raw animation clips remain separate from the
  state machine that selects and blends them.
- GLB is the runtime entity model format. Editable Blockbench or Blender files stay separate because glTF is designed
  for runtime delivery rather than lossless authoring round trips.
- A loopback-only local editor bridge is the primary save path. It validates complete snapshots and atomically writes
  only allowlisted content and generated roots; the deployed game contains no write endpoint.

## Implemented Phase A Compatibility Foundation

- `vf:legacy_v1` freezes the original dimensions, render distance, terrain bounds, tree thresholds, and random salts.
  Saved identity includes profile ID, generator version 1, and content-registry version 1.
- Current saves use `voxel-frontier.world.v2`. A valid v1 payload is read and copied to v2 without modifying or
  deleting the original v1 key. Invalid current data blocks subsequent writes rather than being overwritten.
- Chunk block storage is divided into profile-sized vertical `ChunkSection` instances. Each section owns its mesh,
  while `Chunk` preserves the original absolute-Y block API used by generation and saved edits.
- Streaming still manages complete horizontal chunk columns. Full column remeshing occurs only when chunks load or
  unload; block edits remesh the touched section, cardinal boundary sections, and vertical boundary sections.
- `WorldGenerator` receives the resolved profile. Legacy formulas, evaluation order, thresholds, salts, and block
  placement are unchanged, but their values now come from the frozen profile.
- Pristine generated chunks used to compare player edits are retained in an eight-entry least-recently-used cache.
  Cached chunks never receive saved or live player changes.

## Implemented Phase D Generation Engine

- `vf:engine_v2` is a separate compatibility identity at generator version 2 and content-registry version 2.
  `WorldGenerator` dispatches to it only when the resolved profile carries the generated engine configuration;
  `vf:legacy_v1` continues through the original generator without algorithm or evaluation-order changes.
- Every climate, terrain, cave, aquifer, ore, decoration, and structure field derives from a named seed stream.
  Coordinate hashing and attempt indices make output independent of chunk load order and unrelated feature additions.
- Engine terrain combines continentalness, erosion, ridges, biome elevation, local detail, and volumetric overhang
  density. Caves apply protected-surface cheese fields and intersecting tunnel fields before aquifer resolution.
- Aquifers use local water-table and pressure fields, with deterministic deep lava pockets. Water and lava are stable
  append-only block IDs 53 and 54 supplied by the generated block registry rather than simulated with unrelated blocks.
- Surface materials are ordered as bedrock, exposed shore or underwater material, biome top and filler, then depth-
  aware base strata. Ores replace only eligible natural rock after cavities and surface materials exist.
- Ore definitions select a real scatter, blob, sheet, stratum, or segmented-vein geometry and an independent uniform,
  triangular, Gaussian-like, noise-gated, or fixed-grid vertical distribution. Neighbor anchor scans preserve seams.
- Structures select one candidate per spacing region, enforce separation, filter biomes, adapt foundations to slopes,
  and cross chunk boundaries. The runtime supports complete procedural wells and ruins plus validated inline templates.
- Decorations scan neighboring attempt chunks so tree canopies, boulders, and columns do not terminate at borders.
- `explainCoordinate` replays terrain, ore, structure, and decoration passes in an isolated production `Chunk` and
  reports climate, biome, density, cave status, surface height, and the exact block after every ordered pass.
- Generated profile validation rejects invalid dimensions, scales, climate ranges, cave and aquifer controls, duplicate
  IDs, unsafe placement budgets, invalid ore geometry, malformed spacing, and unbounded template operations before
  generation begins.

## Implemented Phase C Editor Foundation

- `editor.html` is a separate local authoring entry. It operates on a complete in-memory snapshot and never parses or
  rewrites handwritten TypeScript. The browser reads and saves canonical `content/**/*.json` only through the bridge.
- Every field edit is an RFC 6901 pointer replacement recorded by a bounded command stack. Dirty files and field-level
  before-and-after values are derived from the loaded baseline, so undo, redo, validation, and change review share one
  source of truth.
- The inspector derives string, namespaced-ID, local-ID, number, Boolean, enum, color, object, and ordered-list controls
  from canonical JSON. Engine profile version 1 is read-only in the GUI to preserve exact legacy seed behavior.
- The Three.js viewport uses the production texture atlas for block faces, reproduces the production procedural tile
  painter for unsaved recipe changes, visualizes authored terrain controls deterministically, resolves entity asset
  references across the unsaved snapshot, and disposes transient GPU resources on every selection change.
- The source bridge is a serve-only Vite plugin bound to literal loopback. A random process token is injected only into
  `editor.html`; requests also require a matching loopback Host and Origin. The play-only entry receives no token.
- The bridge discovers canonical content at startup and treats those paths as the immutable write allowlist. Generated
  writes are limited to kebab-case TypeScript files under `src/generated/`; request JSON and compiler output have fixed
  structural and byte budgets.
- Saving validates the complete snapshot, rejects stale revision or semantic hashes, checks the disk again for external
  edits, generates files in memory, stages same-directory replacements, and rolls committed files back if any rename
  fails. Byte-identical generated output is not rewritten.
- Integration requires `validateContentFiles(files)` to return diagnostics without writing and
  `generateContentFiles(files)` to return generated path-to-text output without writing. Vite must include
  `editorBridgePlugin()` only for editor mode and serve `editor.html` as the editor entry.

## Exact Editor Simulation Boundaries

- Terrain preview is not a visual approximation. Unsaved canonical profile, biome, ore, decoration, structure, block,
  and salt values compile in the browser to `EngineWorldgenProfile`, then run through `EngineWorldGenerator`, `Chunk`,
  and `ChunkMesher` with the production atlas and opaque/translucent materials.
- Same-seed comparison renders the current unsaved and last-generated engine profiles side by side. Coordinate
  explanation calls the production pass replay and names the exact block after terrain, ore, structure, and decoration
  passes for both profiles.
- Entity tests instantiate the production `EntityManager` with unsaved canonical entity, asset, animation, behavior,
  spawn, loot, dialogue, and trade adapters. Its world boundary lazily generates real engine-v2 chunks using the same
  unsaved seed and stream salts as terrain preview.
- The isolated test player implements only the normal combat boundary. Test persistence never accesses local storage;
  it retains entity and inventory snapshots in memory and is discarded with the editor scene.
- Entity and behavior panels inspect detached `EntityDebugSnapshot` values rather than accessing mutable manager
  internals. Spawn, engagement, and damage controls enter the normal manager, renderer, behavior, physics, combat,
  death, and loot paths.
- The content compiler now exports the exact non-writing bridge contracts. Its immutable `CONTENT_FILE_PATHS` is the
  editor write allowlist; the bridge does not discover or accept arbitrary additional JSON paths.

## Completed Runtime Contracts for Phases B–F

- Canonical JSON is the only editable game-content source. Ten generated registries provide stable runtime imports;
  bridge validation and generation use the same pure in-memory compiler functions as command-line verification.
- World schema v3 preserves v1 and v2 rollback sources and stores generation identity, sparse edits, entity-state v2,
  persistent death tombstones, and collected entity loot. Existing frozen worlds never enter the engine-v2 pipeline.
- Engine-v2 randomness is derived from persisted subsystem and per-feature salts. Probability checks use `[0,1)`
  samples, so authored zero and one probabilities have exact rejection and acceptance semantics.
- Entity definitions carry version, faction, persistence, collider, physics, perception, health, combat, model,
  animation, behavior, spawn, loot, dialogue, and trade references. Runtime systems consume those components without
  branching on Cartographer, Stoneback, or Mossling IDs.
- Behavior content is bounded typed data, not executable source. Graph validation rejects missing nodes, cycles,
  unreachable nodes, invalid conditions and actions, unsafe ranges, and dangling references before generation.
- Production entity testing is isolated from the saved game while retaining real generation, meshing, spawning,
  navigation, behavior, physics, combat, animation, loot, dialogue, and trade code paths.
- Water and lava have stable translucent render IDs and generation behavior. Dynamic fluid propagation, inventory,
  crafting, survival, lighting, audio, particles, dimensions, and multiplayer authority belong to Phase G rather than
  being stubbed inside the completed Phase B–F systems.

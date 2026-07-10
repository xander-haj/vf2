# Voxel Frontier Engine Architecture Plan

## 1. Decision

Voxel Frontier should evolve into its own data-driven engine without replacing its working Three.js runtime.
The current game becomes the runtime and preview target. A separate local editor uses the same content schemas,
rendering adapters, and generation code, so what is shown in the editor is what the game builds and runs.

The editor must not parse and rewrite arbitrary handwritten TypeScript. Canonical, versioned content files are the
editable source of truth. A deterministic compiler validates those files and generates TypeScript registries for the
runtime. Generated files are never edited by hand, and handwritten engine code never becomes editor output.

## 2. Confirmed Starting Point

- The project is a strict TypeScript, Three.js, and Vite browser game.
- `src/main.ts` creates one `Game`, and `Game` directly owns the renderer, world, player, input, interaction, and HUD.
- `World` owns chunk streaming, terrain generation, meshing, block queries, edits, sparse persistence, and cleanup.
- Chunks are fixed 16-by-64-by-16 byte arrays and a five-by-five horizontal area stays loaded.
- Blocks, textures, hotbar entries, biomes, geology, ore rules, trees, and tuning values are compiled into source.
- Textures are original procedural canvas artwork. No external asset library or asset build pipeline exists.
- The player is the only actor. There is no generic entity, NPC, enemy, AI, animation, or spawn runtime.
- Saves contain schema version 1, one 32-bit numeric seed, and sparse coordinate-to-block-ID edits.
- Block IDs are byte-sized and append-only; existing saves depend on their meanings remaining unchanged.
- Terrain is a two-dimensional heightfield followed by surface strata, geology, ores, and deterministic trees.

## 3. Non-Negotiable Architecture Boundaries

1. Existing worlds remain readable. Legacy block IDs keep their meanings permanently.
2. A seed is reproducible only with the same generator version and world-generation profile.
3. The editor and game consume the same validated content snapshot and runtime adapters.
4. Content files describe data and safe graphs. They never contain executable strings or remote scripts.
5. Custom logic is registered in reviewed TypeScript and referenced from content by a stable namespaced ID.
6. Runtime assets are separated from editable source assets and generated build artifacts.
7. Every saved definition has a format version and every persisted entity has a migration version.
8. The deployed GitHub Pages game is play-only. Source-writing tools are available only in local editor mode.
9. Generation remains coordinate-deterministic and independent of chunk loading order.
10. Proprietary Minecraft code, textures, models, sounds, namespaced data, and other assets are not copied.

## 4. Source-to-Runtime Flow

```text
content source + source assets
             |
             v
schema validation -> deterministic content compiler -> generated TypeScript registries + runtime assets
             |                                      |
             v                                      v
editor working snapshot ----------------------> shared engine runtime
             |                                      |
             v                                      v
reviewed save transaction                       playable game build
```

The editor renders an in-memory working snapshot before saving. Saving validates the complete snapshot, shows the
affected files, and writes canonical content plus deterministic generated output. A failed validation writes nothing.

## 5. Proposed Repository Layout

These paths are the intended implementation layout; they are not created by this planning phase.

```text
content/
  project.json
  blocks/
  items/
  entities/
  behaviors/
  animations/
  spawn-rules/
  worldgen/
    profiles/
    biomes/
    surface-rules/
    features/
    structures/
assets-source/
  textures/
  models/
  audio/
public/assets/
  textures/
  models/
  audio/
src/engine/
  assets/
  content/
  entities/
  rendering/
  simulation/
  worldgen/
src/editor/
  commands/
  panels/
  tools/
  viewport/
src/generated/
tools/
  content-compiler/
  editor-bridge/
editor.html
```

`content/` and `assets-source/` are authoring inputs. `src/generated/` and optimized files under `public/assets/`
are deterministic outputs. The game runtime imports only generated registries and runtime assets.

## 6. Canonical Content Contracts

Every identifier uses a namespaced string such as `vf:grass`, `vf:zombie`, or `vf:overworld_default`. File names use
kebab-case, while identifiers remain stable when display names change.

| Contract | Required responsibility |
| --- | --- |
| Project | Content format, generator version, default world profile, registry compatibility |
| Block | Stable numeric legacy ID, behavior flags, collision, render material, drops, tags |
| Item | Stack rules, icon/model, placement or use action, durability, tags |
| Texture | Source URI or procedural recipe, color space, filtering, atlas group, license metadata |
| Entity type | Components, collider, render definition, behavior graph, animation controller, persistence |
| Behavior graph | Typed nodes, parameters, transitions, priorities, reviewed custom-action references |
| Animation | Model clip names, playback rules, blend duration, events, root-motion policy |
| Spawn rule | Entity type, biome tags, height/light/time rules, density cap, cluster size, rarity |
| World profile | Seed policy, dimensions, height, sea level, terrain graph, ordered generation passes |
| Biome | Climate ranges, terrain modifiers, surface rule, feature sets, spawn sets, ambience |
| Surface rule | Ordered conditions and top, filler, foundation, shoreline, and underwater materials |
| Feature | Placement pass, target blocks, distribution, attempts, chance, cluster shape, block palette |
| Structure | Template asset, connectors, spacing, separation, biome filters, terrain adaptation |

Schema validation must reject duplicate IDs, duplicate legacy block numbers, missing references, dependency cycles,
invalid ranges, unknown graph nodes, unsafe paths, and assets without ownership or license metadata.

## 7. How Seeded Terrain Actually Needs to Work

Minecraft's documented process is multi-pass: noise establishes landforms, climate and elevation select biomes,
structures are placed, and feature passes distribute trees, plants, ores, and similar content. The seed supplies
deterministic randomness; it does not directly select one final block for a coordinate.

Voxel Frontier should use this compatibility tuple:

```text
world seed + generator version + world profile ID + content registry version
```

Changing any tuple member creates a different untouched world. The save records the complete tuple. Existing version
1 saves migrate to a frozen `vf:legacy_v1` profile that exactly preserves current terrain and block meanings.

### 7.1 Deterministic Random Streams

- Expand the root seed into named streams for climate, terrain, caves, each ore, each feature, structures, and spawns.
- Derive samples from the world seed, dimension ID, subsystem salt, feature ID, chunk coordinate, and attempt index.
- Never share one sequential random stream across unrelated features; adding a flower must not move every ore vein.
- Use stable integer hashing and specified numeric operations so generation does not depend on object iteration order.
- Treat every salt and noise parameter as persisted compatibility data, not an incidental implementation constant.

### 7.2 Ordered World-Generation Pipeline

1. Resolve the saved world profile and seed context.
2. Sample broad climate fields: continentalness, erosion, temperature, humidity, and variation.
3. Produce base terrain density from continental shape, valleys, ridges, erosion, and local detail.
4. Apply three-dimensional density and carvers for caves, arches, overhangs, and underground openings.
5. Resolve fluids and aquifer regions after solid density but before surfaces and cave decoration.
6. Select surface and cave biomes from climate, elevation, depth, and density conditions.
7. Apply ordered surface rules for top, filler, foundation, shore, seabed, and underwater blocks.
8. Replace eligible geology with strata, blobs, sheets, veins, and ordinary ore clusters.
9. Place structures with deterministic region spacing and terrain-adaptation rules.
10. Place ordered features such as trees, plants, rocks, springs, geodes, and biome decorations.
11. Resolve initial spawn and later chunk-aware entity spawn rules.

Each pass reads the prior pass's stable output and writes only its declared layer. Pass order is part of the generator
version. A debug view must be able to display the result before and after every pass.

### 7.3 Cluster Controls

Cluster generation needs explicit controls rather than buried thresholds:

- Target and replaceable block tags
- Minimum and maximum height
- Eligible biome and dimension tags
- Distribution type: uniform, triangular, Gaussian, noise-gated, or fixed grid
- Attempts per chunk or region and probability per attempt
- Cluster count, bounding size, desired block count, and edge falloff
- Shape: scatter, walk, blob, sheet, stratum, or intersected-noise vein
- Exposure policy for ores touching air or water
- Per-feature salt and generation pass
- Performance cost estimate and maximum placement budget

Luanti's open voxel API confirms that different ore shapes require different parameter sets: scatter clusters use
scarcity, block count, and bounding size, while blobs, sheets, strata, and veins use noise fields differently. The
editor should therefore expose shape-specific controls instead of one misleading universal "cluster size" field.

## 8. World-Generation Editor

The world editor is a viewport mode inside the engine editor, using the real generation pipeline.

### Required panels

- Seed and compatibility: numeric/text seed, randomize, copy, profile, generator version, legacy warning
- Terrain graph: named noise nodes, domain transforms, curves, blends, clamps, and density output
- Climate: field parameters, biome ranges, overlap diagnostics, and unassigned-region diagnostics
- Surface rules: ordered conditions with live column previews and block-palette inspection
- Features: distribution, cluster shape, eligibility, ordering, and estimated placement density
- Structures: template preview, connectors, spacing grid, biome filters, and terrain adaptation
- Performance: generation time budget, block counts, mesh counts, and memory estimate by preview radius

### Required views

- Two-dimensional height, climate, biome, feature-density, and structure-region maps
- Vertical density and material slice at a selected coordinate
- Three-dimensional chunk preview rendered by the production chunk renderer
- Same-seed side-by-side comparison between two profile revisions
- Pass isolation showing terrain before and after caves, surfaces, ores, structures, and decorations

Every control change regenerates only affected preview chunks. Saving a change that alters existing seed output must
require a generator-version decision: preserve the old version, create a new version, or explicitly migrate a world.

## 9. Entity, NPC, and Enemy Engine

### 9.1 Definitions and instances

An entity definition is immutable content. An entity instance is saved runtime state with a unique ID, type ID,
definition version, transform, component state, and chunk ownership. Definitions can update without rewriting every
instance; incompatible state changes use explicit migrations.

### 9.2 Initial component set

- Transform and previous transform for interpolated rendering
- Collider, gravity, grounded state, and voxel collision mask
- Render model, material variants, shadow policy, and animation controller
- Health, damage, resistances, death, drops, and invulnerability windows
- Movement speed, acceleration, jump, swim, and step-height capabilities
- Perception for sight, hearing, target filters, and memory duration
- Navigation request, current path, obstacle state, and movement intent
- Faction, hostility, owner, team, and relationship rules
- Interaction, dialogue, trading, quest hooks, and name presentation for NPCs
- Inventory, equipment, pickup, and loot-table references
- Despawn, persistence, chunk activation, and save policy

### 9.3 Behavior authoring

The GUI authors typed behavior graphs. Initial nodes cover idle, wait, random stroll, look at target, flee, follow,
patrol, acquire target, chase, melee attack, ranged attack, interact, play animation, emit event, and change state.

Nodes have typed ports and bounded parameters. Conditions read a documented blackboard. Graph validation rejects
cycles without an explicit loop/decorator, missing targets, incompatible ports, and unregistered custom actions.
There is no `eval`, JavaScript text box, or remote script loader. Complex custom behavior remains reviewed TypeScript
registered under an ID that the graph can invoke.

### 9.4 Animation and rendering

Raw animation clips and animation-controller logic remain separate. glTF/GLB supplies model hierarchy, materials,
skins, and keyframed clips; a content-authored state machine chooses idle, walk, attack, hurt, death, and custom
states. This matches the documented separation between animation data and controller transitions.

The entity renderer owns model caching, animation mixers, material variants, visibility, interpolation, and disposal.
Entity simulation never manipulates Three.js objects directly.

### 9.5 Runtime order

1. Activate or sleep entities as chunks stream.
2. Apply queued spawn, load, and despawn operations.
3. Update perception and target memory at a bounded frequency.
4. Advance behavior graphs and navigation requests.
5. Resolve movement, voxel collision, combat, and interactions.
6. Commit events and component changes.
7. Interpolate transforms and advance render animations.
8. Persist only entities whose save policy requires it.

## 10. Asset Separation and Optimization

### 10.1 Asset classes

- Block textures and procedural texture recipes
- Item icons and held-item models
- Entity and structure models
- Animation clips and controller definitions
- Particles, UI images, fonts, and shaders
- Music, ambience, effects, and dialogue audio
- Structure templates and terrain brushes

Every asset manifest entry includes a stable ID, source path, runtime path, type, dimensions, color space, filtering,
license, author, source URL when applicable, content hash, and size budget.

### 10.2 Formats

- Preserve the current procedural block recipes as valid authoring assets during migration.
- Use lossless PNG for original pixel-art source textures.
- Use GLB as the web runtime format for entity models and keyframed clips.
- Retain editable `.bbmodel` or Blender sources separately; glTF is a runtime delivery format, not an authoring format.
- Defer KTX2 texture compression until uncompressed assets, visual baselines, and device support are verified.
- Select runtime audio formats only after desktop and mobile browser compatibility tests are defined.

Khronos defines glTF as a compact, interoperable runtime asset format, and Three.js already provides `GLTFLoader`
with animation, material, mesh-compression, and KTX2 extension support. Blockbench is open source and exports glTF/GLB
with hierarchy, materials, and animation, so it is the recommended external model authoring companion initially.

### 10.3 Block rendering

The first migration keeps the current shared atlas and exposed-face mesher, but moves tile definitions out of source.
The compiler packs tiles in deterministic stable-ID order and generates UV metadata. Later profiles may select texture
arrays after WebGL capability checks. Transparent, cutout, emissive, liquid, and animated blocks require separate
material groups and render passes; they must not be forced through the current single opaque material.

## 11. Editor Application

The editor gets its own `editor.html` entry but reuses engine modules. It is not the stock Three.js Editor: that tool
can edit and export scene graphs, but it cannot author this game's chunk generation, block registries, entity
components, behavior graphs, spawn rules, save migrations, or deterministic build outputs.

### 11.1 Core workspace

- Production renderer viewport with game, fly-camera, orbit, and orthographic modes
- Content browser grouped by blocks, items, entities, behaviors, world generation, and raw assets
- Hierarchy/outliner for the active preview scene, structure, model, or behavior graph
- Typed inspector generated from the same content schemas used by validation
- Undo/redo command stack with grouped transactions and dirty-state tracking
- Validation panel with file, field path, severity, and direct navigation to the failing control
- Preview console for structured engine diagnostics without local paths or stack traces
- Explicit Play/Test mode that uses an isolated preview save and never mutates the player's normal world

### 11.2 Saving source safely

The primary save path is a local, development-only editor bridge because browser directory writing is not consistently
available across major browsers. The bridge binds only to loopback, issues a per-launch token, accepts no arbitrary
paths, and restricts writes to approved content and generated-output roots.

A save transaction performs schema validation, reference validation, deterministic generation, expected-revision
checking, and a displayed file diff before atomically replacing files. Unknown files and handwritten source are never
deleted. The production build does not include the bridge or any write endpoint.

The browser File System Access API may be an optional Chromium-oriented adapter later. Its specification requires
user-picked files or directories and permission-gated writes, while current compatibility remains limited.

## 12. Implementation Roadmap

Build commands, verification requirements, implementation phases, risks, and research references are maintained in
[the engine implementation roadmap](./engine-implementation-roadmap.md).

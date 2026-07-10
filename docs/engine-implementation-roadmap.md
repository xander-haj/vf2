# Voxel Frontier Engine Implementation Roadmap

This companion to the engine architecture defines delivery order, verification, risks, and the research basis.

## Implementation Status

Phases A through F are implemented. Phases B through F include canonical content compilation, the local GUI editor,
the engine-v2 generation pipeline, asset-backed entity rendering and persistence, and data-authored NPC and enemy
logic. Phase G remains a separate future scope for inventory, crafting, survival, lighting, dynamic fluids, audio,
particles, additional dimensions, and multiplayer authority.

Repository instructions reserve command execution for Xander. After reviewing content changes, run
`npm run content:validate`, `npm run test:content`, and `npm run build`. Use `npm run editor` for production-backed
terrain and isolated entity verification.

## 1. Build and Verification Pipeline

The implemented verification and authoring commands are:

| Command | Responsibility |
| --- | --- |
| `npm run content:validate` | Validate schemas, references, versions, licenses, and asset constraints |
| `npm run content:generate` | Produce deterministic registries and runtime asset manifests |
| `npm run editor` | Start the loopback-only local editor and save bridge |
| `npm run build` | Validate, generate, type-check, and build the playable Vite output |

Required automated verification includes golden seed snapshots, cross-chunk continuity, generation-order
independence, legacy save migration, stable generated output, invalid-content rejection, entity lifecycle, behavior
graph transitions, asset disposal, and build exclusion of editor write capabilities.

## 2. Correct Implementation Order

### Phase A — Compatibility foundation

- Freeze the current generator as `vf:legacy_v1`.
- Add world profile, generator version, registry version, and migration handling to saved worlds.
- Replace whole-chunk regeneration during edit comparison with a generation query/cache boundary.
- Partition future chunk storage and meshes into vertical sections before increasing world height.

Acceptance: existing seeds, edits, block IDs, terrain, controls, and rendering remain unchanged.

### Phase B — Content compiler and registries

- Define versioned contracts and validation errors.
- Extract blocks, hotbar, procedural textures, biomes, geology, and trees into canonical content.
- Generate typed registries and deterministic atlas metadata.
- Keep handwritten runtime imports behind stable registry interfaces.

Acceptance: generated runtime output is visually and behaviorally identical to the current game.

### Phase C — Editor foundation

- Add editor entry point, viewport modes, content browser, typed inspector, commands, undo/redo, and validation.
- Add the loopback editor bridge, revision checks, diff review, and atomic allowlisted saves.
- Preview block, texture, biome, and feature changes through production rendering code.

Acceptance: a block or legacy biome can be edited, previewed, saved, regenerated, and built without manual source edits.

### Phase D — Generation engine

- Add named seed streams, profile graphs, climate fields, density terrain, surface rules, and pass debugging.
- Add configurable caves, fluids, ore shapes, decorations, and structure placement in ordered milestones.
- Add golden-seed fixtures and same-seed profile comparisons before changing defaults.

Acceptance: the editor can explain why a coordinate became a biome and block at every generation pass.

### Phase E — Asset and entity rendering

- Add asset manifests, GLB loading, caching, error boundaries, model previews, animation clips, and disposal.
- Add entity definitions, instances, chunk activation, transforms, colliders, rendering, and persistence versions.

Acceptance: a GUI-authored passive test entity appears, animates, collides, sleeps with chunks, and reloads correctly.

### Phase F — NPC and enemy logic

- Add perception, factions, behavior graphs, navigation, health, combat, drops, and spawn rules.
- Add dialogue and trading hooks for NPC definitions.
- Add editor graph validation, live blackboard inspection, and isolated combat/spawn test scenes.

Acceptance: independently authored NPC and enemy definitions appear through deterministic spawn rules and execute
their configured behavior without entity-specific code in the frame loop.

### Phase G — Full sandbox systems

- Build items, inventory, crafting, equipment, survival state, lighting, particles, audio, fluids, structures, and
  additional dimensions as separate approved task areas on the same content foundation.
- Treat multiplayer as a later authority and replication architecture, not an extension of local-storage saves.

## 3. Principal Risks and Controls

| Risk | Required control |
| --- | --- |
| Seed output changes silently | Saved generator versions, frozen legacy profile, golden chunk snapshots |
| Adding a feature reshuffles others | Named per-feature salts and coordinate-derived random streams |
| Editor corrupts handwritten code | Canonical content only, deterministic generation, allowlisted atomic writes |
| Expanded height exhausts memory | Vertical sections, worker-ready generation, bounded streaming budgets |
| Entity count stalls frames | Spatial indexing, sleep states, bounded AI rates, pooled/cached render resources |
| Asset memory leaks | Central asset ownership, reference counting, explicit Three.js disposal |
| Content references break | Full registry and graph validation before preview, save, or build |
| GUI permits unsafe logic | Typed nodes and reviewed action IDs; no evaluation of content strings |
| Scope becomes one giant rewrite | Compatibility-first phases with independently verifiable acceptance criteria |

## 4. Research Basis

- [Microsoft world-generation overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/world-generation)
  documents seed-driven noise and ordered terrain, biome, structure, feature, sky, and final passes.
- [Microsoft feature taxonomy](https://learn.microsoft.com/en-us/minecraft/creator/documents/featurestaxonomy)
  separates natural features, terrain carvers, block placers, conditional placement, sequences, and aggregates.
- [Luanti ore documentation](https://api.luanti.org/ores/) provides an open voxel-engine reference for scatter,
  sheet, puff, blob, vein, and stratum generation with shape-specific noise and cluster controls.
- Microsoft documents reusable components and composable AI goals in its
  [entity-components guide](https://learn.microsoft.com/en-us/minecraft/creator/documents/entitycomponentsguide).
- Microsoft separates raw keyframed movement from state and transition logic in its
  [animation/controller guide](https://learn.microsoft.com/en-us/minecraft/creator/documents/animationsvscontrollers).
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) defines an open,
  efficient runtime format for scenes, meshes, materials, skins, and animation.
- [Three.js GLTFLoader documentation](https://threejs.org/docs/pages/GLTFLoader.html) confirms direct glTF/GLB and
  relevant compression-extension support in the project's existing renderer dependency.
- [Blockbench repository](https://github.com/JannisX11/blockbench) confirms the low-poly editor is open source and
  that creator-owned models can be exported in standardized formats.
- [File System Access specification](https://wicg.github.io/file-system-access/) documents explicit user-selected,
  permission-gated local file access and its security requirements.

## 5. Recommended First Implementation Slice

Begin with Phases A and B only: save compatibility, frozen legacy generation, content contracts, validation, and
extraction of the existing block/texture/biome/geology data. This is the minimum correct foundation for every GUI,
entity, and terrain feature above. Starting with a visual editor before establishing these contracts would make the
editor write unstable representations and force a second migration later.

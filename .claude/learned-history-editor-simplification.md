# Learned History — Editor Simplification

## Durable Interaction Contracts

- Simplicity means progressive disclosure, not removing canonical fields, test tools, validation, or save behavior.
- One shared content-kind classifier must drive browser categories, row icons, workspace filters, and preview support.
  A row marked as visual must render; a row marked as rules or data must never receive a fabricated fallback object.
- Gummi-style construction maps to four mouse-first tools: add a selected piece, select and move a piece, paint a
  piece, and erase a piece. The existing drag-to-orbit and wheel-to-zoom camera controls remain unchanged.
- Every visual builder mutation must pass through `EditorCommandStack`, so undo, redo, change review, validation,
  revision checks, atomic saves, and deterministic code generation retain their existing contracts.
- Raw canonical fields remain available in a collapsed Advanced details section for complete expert control.

## Implemented Simplified Editor Architecture

- The left library no longer uses physical JSON files as its visible hierarchy. Source paths remain searchable and
  appear in tooltips, while friendly content categories provide the normal navigation model.
- All currently graphical kinds—blocks, procedural textures, assets, entities, biomes, and generation definitions—use
  the same cube icon. Animations, behavior graphs, spawning, loot, dialogue, trading, project settings, and documents
  use logic or page icons and enter a data-only viewport state until an explicit runtime test is started.
- Procedural model construction uses exact canonical `parts` records. Visual pieces are ordinary named cuboids, so
  runtime rendering, animation part lookup, compiler output, and GUI edits consume one representation.
- Direct builder clicks raycast existing pieces before intersecting the active horizontal grid plane. Short clicks
  select or place; pointer travel remains orbit input, which prevents model edits during camera drags.
- Visual block face painting resolves choices from the complete unsaved texture snapshot and changes only the chosen
  top, side, or bottom reference through the command stack.
- World-object preview identity must include the selected definition, not only the seed and complete profile. Biomes
  are focused by reducing the production profile to one biome; probabilistic features are revealed by comparing exact
  production chunks with and without one guaranteed eligible placement while preserving their geometry and materials.
- Shared biome materials are intentional voxel composition, not missing assets. The editor distinguishes biome output
  with forced terrain plus explicit top, filler, shore, and underwater material cards.

## Strict Editor Type Boundaries

- With `noUncheckedIndexedAccess`, values read through `JsonObject` string keys are `JsonValue | undefined`; local
  object guards and optional preview readers must accept that boundary before narrowing.
- Optional texture patterns intentionally produce the base noise tile without an overlay, so the painter accepts an
  absent pattern and its exhaustive switch performs no pattern branch.
- Builder palette state uses the union of every `BUILDER_COLORS` tuple entry; unannotated initialization from index
  zero incorrectly narrows the mutable field to only the first color literal.

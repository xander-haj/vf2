# Bugfix History — Editor Simplification

## 2026-07-10 10:20 — BUG_FIXED

**Bug:** Rules, dialogue, loot, trade, animation, and other data records displayed an unrelated cube preview.  
**Root cause:** The viewport's final selection branch treated every kind other than terrain, entity, asset, or texture
as a block definition.  
**Fix applied:** Added one shared content-kind contract and restricted preview construction to kinds explicitly marked
graphical. Data-only selections now display a truthful explanation instead of fabricated geometry.  
**Files changed:** src/editor/editor-content-kind.ts, src/editor/editor-content-browser.ts,
src/editor/editor-viewport.ts  
**Verification:** Static branch tracing confirmed every graphical classifier maps to one explicit preview branch and
every non-graphical classifier returns before geometry creation.

## 2026-07-10 10:21 — BUG_FIXED

**Bug:** Entity fallback preview construction referenced an undefined numeric-field reader.  
**Root cause:** `EditorViewport.createEntityPreview` called `readNumber`, but that helper did not exist in the module.  
**Fix applied:** Extracted entity preview construction to a focused module with complete finite-number and string
readers, exact procedural-part rendering, part indices for picking, and linked-definition resolution.  
**Files changed:** src/editor/editor-entity-preview.ts, src/editor/editor-viewport.ts  
**Verification:** Static symbol tracing confirmed every entity-preview helper is defined and every import target exists.

## 2026-07-10 10:50 — BUG_FIXED

**Bug:** Many distinct `vf:` biomes, ores, decorations, structures, and legacy features repeated the same editor
render.  
**Root cause:** Every world-object selection generated chunk `(0,0)` from the complete profile and current preview
seed. The selected definition's ID and type never influenced preview generation, so the same seed produced the same
chunk for every row.  
**Fix applied:** Added selection-focused production previews. Engine biomes are forced individually and accompanied
by their real surface material palette. Engine ores, decorations, and structures are isolated by comparing production
chunks with and without a guaranteed selected placement. Legacy biomes and features receive material-accurate isolated
cards. Missing registered block assets now raise an explicit error rather than falling back to stone.  
**Files changed:** src/editor/editor-world-object-preview.ts, src/editor/editor-viewport.ts, editor.html, README.md  
**Verification:** Static routing confirmed every selected engine biome, ore, decoration, and structure ID reaches its
focused branch; every legacy biome, band, tree, bedrock, rock pocket, and ore type reaches a legacy branch; whole
profiles alone retain the full seed-chunk preview.

## 2026-07-10 11:10 — BUG_FIXED

**Bug:** GitHub Actions TypeScript compilation rejected indexed world-generation, texture, and inspector JSON values
because `undefined` could reach helpers declared for `JsonValue` only.  
**Root cause:** `JsonObject` has a string index signature and the project enables `noUncheckedIndexedAccess`, so
property reads are correctly typed as `JsonValue | undefined`; three local helper contracts omitted that boundary.  
**Fix applied:** Widened the two object guards and the optional texture-pattern painter to accept `undefined`, while
retaining their existing false or no-overlay behavior for absent values.  
**Files changed:** src/editor/editor-worldgen-panel.ts, src/editor/editor-texture-preview.ts,
src/editor/editor-inspector.ts  
**Verification:** Static call-site inspection confirmed indexed properties now enter helpers that accept
`undefined`, then narrow before nested property access.

## 2026-07-10 11:10 — BUG_FIXED

**Bug:** GitHub Actions rejected selecting any block-builder palette color other than the first entry.  
**Root cause:** The mutable `color` field inferred the single literal type `"#5f8fc2"` from tuple index zero, while
palette iteration produces the union of all eight color literals.  
**Fix applied:** Declared `BuilderPaletteColor` from the complete `BUILDER_COLORS` tuple and annotated the mutable
field with that union.  
**Files changed:** src/editor/editor-block-builder.ts  
**Verification:** Static type tracing confirmed initialization and every later assignment use the same complete
palette-entry union.

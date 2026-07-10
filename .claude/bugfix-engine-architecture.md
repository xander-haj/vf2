# Bugfix History — Engine Architecture

## 2026-07-10 09:00 — BUG_FIXED

**Bug:** Authored generation salts were present in canonical data but did not affect runtime output.  
**Root cause:** The runtime profile omitted subsystem salts and feature placers derived fields only from IDs.  
**Fix applied:** Added validated subsystem and per-feature salts and consumed them in world and spawn hashes.  
**Files changed:** src/engine/worldgen/seed-stream.ts, src/engine/worldgen/generation-context.ts,
src/engine/worldgen/feature-placer.ts, src/engine/worldgen/structure-placer.ts,
src/engine/entities/entity-spawner.ts, content/worldgen/**, content/spawn-rules/entity-spawns.json  
**Verification:** Static tracing confirmed every canonical salt reaches its production hash input.

## 2026-07-10 09:01 — BUG_FIXED

**Bug:** Persistent actors killed during play respawned after reload.  
**Root cause:** Persistence serialized living actors only and retained no deletion identity.  
**Fix applied:** Persistent deaths now store health-zero tombstones that remain occupied and are never woken.  
**Files changed:** src/engine/entities/entity-manager.ts, src/engine/entities/entity-persistence.ts,
src/storage/world-save-model.ts  
**Verification:** Static lifecycle tracing confirmed death, dispose, reload, population, and wake retain tombstones.

## 2026-07-10 09:02 — BUG_FIXED

**Bug:** Entity attacks could land through blocks, and a just-killed enemy could act once more.  
**Root cause:** Damage checked distance only and death removal occurred after behavior on the following frame.  
**Fix applied:** Added voxel line-of-sight, alive guards, and immediate idempotent death removal.  
**Files changed:** src/engine/entities/entity-combat.ts, src/engine/entities/entity-manager.ts,
src/engine/entities/entity-perception.ts, src/engine/entities/behavior-runner.ts  
**Verification:** Static update-order tracing confirmed visibility and life state are checked before damage.

## 2026-07-10 09:03 — BUG_FIXED

**Bug:** Wide actors could enter narrow gaps, overlap actors, or be trapped by block placement.  
**Root cause:** Navigation and spawning checked one column, with no actor placement or overlap boundary.  
**Fix applied:** Added full AABB clearance, world-aware overlap relaxation, and entity-safe placement.  
**Files changed:** src/engine/entities/entity-navigation.ts, src/engine/entities/entity-spawner.ts,
src/engine/entities/entity-collision.ts, src/engine/entities/entity-manager.ts,
src/interaction/block-interactor.ts  
**Verification:** Static geometry tracing confirmed every separation proposal remains outside solid voxels.

## 2026-07-10 09:04 — BUG_FIXED

**Bug:** Removing and re-adding one ID during model loading could attach two scene roots.  
**Root cause:** Pending loads used ID membership rather than a unique request generation.  
**Fix applied:** Replaced pending membership with per-request symbols checked before attachment and cleanup.  
**Files changed:** src/engine/entities/entity-renderer.ts  
**Verification:** Static interleaving analysis confirmed stale requests cannot match a later request token.

## 2026-07-10 09:05 — BUG_FIXED

**Bug:** glTF clips played simultaneously and authored attack and hurt durations were ignored.  
**Root cause:** Every clip started at load and entity feedback used a hard-coded duration.  
**Fix applied:** Added shared animation timing, one-state crossfades, and authored procedural feedback.  
**Files changed:** src/engine/entities/entity-animation-library.ts, src/engine/entities/entity-instance.ts,
src/engine/entities/entity-renderer.ts, src/engine/entities/entity-manager.ts  
**Verification:** Static state tracing confirmed one glTF action and authored timer inputs.

## 2026-07-10 09:06 — BUG_FIXED

**Bug:** Dead-player clicks queued during respawn and fired immediately after revival.  
**Root cause:** Inactive interaction returned without consuming one-shot input while pointer lock stayed active.  
**Fix applied:** Inactive interaction drains both actions and dead players cannot route interaction rays.  
**Files changed:** src/game/game.ts, src/interaction/block-interactor.ts  
**Verification:** Static input tracing confirmed death-period actions are consumed before respawn.

## 2026-07-10 09:07 — BUG_FIXED

**Bug:** Probability zero could still spawn content or loot when a deterministic hash was zero.  
**Root cause:** Samples used an inclusive-one divisor and equality counted as success.  
**Fix applied:** Converted samples to `[0,1)` and reject when `sample >= chance`.  
**Files changed:** src/engine/worldgen/seed-stream.ts, src/engine/worldgen/feature-placer.ts,
src/engine/worldgen/structure-placer.ts, src/engine/entities/entity-spawner.ts,
src/engine/entities/loot-system.ts, src/engine/entities/behavior-runner.ts  
**Verification:** Boundary inspection confirmed chance zero rejects and chance one accepts.

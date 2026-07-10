/**
 * Central configuration for simulation, rendering, world generation, and player interaction.
 * Keeping gameplay values here prevents different systems from drifting out of agreement.
 */

import { LEGACY_WORLD_PROFILE } from "../world/world-profile";

// Compatibility aliases keep existing consumers on the frozen legacy profile during the engine migration.
export const CHUNK_SIZE = LEGACY_WORLD_PROFILE.dimensions.chunkSize;

// The legacy height remains unchanged while sectioning prepares storage for later profile-specific dimensions.
export const WORLD_HEIGHT = LEGACY_WORLD_PROFILE.dimensions.worldHeight;

// Vertical sections bound remesh work without altering any generated block coordinate.
export const CHUNK_SECTION_HEIGHT = LEGACY_WORLD_PROFILE.dimensions.sectionHeight;

// A two-chunk radius continues to create the original five-by-five active area.
export const RENDER_DISTANCE = LEGACY_WORLD_PROFILE.renderDistance;

// Terrain revolves around this elevation so both low sand flats and tall hills retain their original shape.
export const BASE_TERRAIN_HEIGHT = LEGACY_WORLD_PROFILE.terrain.baseHeight;

// The lowest rows retain the original irregular bedrock floor.
export const BEDROCK_MAX_HEIGHT = LEGACY_WORLD_PROFILE.terrain.bedrockMaximumHeight;

// Rock at and below this elevation retains deepslate and matching ore variants.
export const DEEPSLATE_MAX_HEIGHT = LEGACY_WORLD_PROFILE.terrain.deepslateMaximumHeight;

// Player dimensions approximate familiar voxel-game proportions while fitting one-block gaps correctly.
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_MAX_HEALTH = 20;
export const PLAYER_HURT_COOLDOWN = 0.55;
export const PLAYER_RESPAWN_DELAY = 2;

// Movement values are measured in blocks per second and tuned for responsive creative exploration.
export const WALK_SPEED = 4.6;
export const SPRINT_SPEED = 7.2;
export const JUMP_SPEED = 8.7;
export const GRAVITY = 25;

// Mouse rotation is expressed in radians per CSS pixel of pointer movement.
export const LOOK_SENSITIVITY = 0.0022;

// Touch drags need slightly more rotation per CSS pixel because thumbs travel less distance than a mouse.
export const TOUCH_LOOK_MULTIPLIER = 1.45;

// Interaction is intentionally limited so edits feel reachable rather than remote.
export const BLOCK_REACH = 6;

// The renderer caps pixel density to avoid excessive GPU cost on high-density displays.
export const MAX_PIXEL_RATIO = 2;

// Large frame gaps are clamped so returning to a backgrounded tab cannot tunnel through terrain.
export const MAX_FRAME_DELTA = 0.05;

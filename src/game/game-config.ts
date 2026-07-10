/**
 * Central configuration for simulation, rendering, world generation, and player interaction.
 * Keeping gameplay values here prevents different systems from drifting out of agreement.
 */

// Each chunk spans 16 blocks horizontally, balancing remesh cost against draw-call count.
export const CHUNK_SIZE = 16;

// A compact vertical range keeps browser memory predictable while retaining caves and hills.
export const WORLD_HEIGHT = 64;

// A two-chunk radius creates a five-by-five active area around the player.
export const RENDER_DISTANCE = 2;

// Terrain revolves around this elevation so both low sand flats and tall hills can form.
export const BASE_TERRAIN_HEIGHT = 25;

// Player dimensions approximate familiar voxel-game proportions while fitting one-block gaps correctly.
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;

// Movement values are measured in blocks per second and tuned for responsive creative exploration.
export const WALK_SPEED = 4.6;
export const SPRINT_SPEED = 7.2;
export const JUMP_SPEED = 8.7;
export const GRAVITY = 25;

// Mouse rotation is expressed in radians per CSS pixel of pointer movement.
export const LOOK_SENSITIVITY = 0.0022;

// Interaction is intentionally limited so edits feel reachable rather than remote.
export const BLOCK_REACH = 6;

// The renderer caps pixel density to avoid excessive GPU cost on high-density displays.
export const MAX_PIXEL_RATIO = 2;

// Large frame gaps are clamped so returning to a backgrounded tab cannot tunnel through terrain.
export const MAX_FRAME_DELTA = 0.05;

// The storage schema version allows future releases to reject incompatible saved data safely.
export const STORAGE_SCHEMA_VERSION = 1;


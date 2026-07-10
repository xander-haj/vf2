/**
 * Resolves the player's axis-aligned body against solid voxel cells.
 * Axis separation prevents corner penetration while remaining deterministic and inexpensive.
 */

import { Vector3 } from "three";
import {
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from "../game/game-config";
import type { World } from "../world/world";

// A small inset treats exact face contact as non-overlap and avoids floating-point jitter.
const COLLISION_EPSILON = 0.0001;

/** Vector axes are restricted to mutable numeric properties shared by position and velocity. */
type Axis = "x" | "y" | "z";

/** CollisionResult communicates whether downward motion found supporting terrain. */
export interface CollisionResult {
  readonly grounded: boolean;
}

/** Reports whether the current player bounds overlap one unit voxel cell. */
function overlapsBlock(position: Vector3, blockX: number, blockY: number, blockZ: number): boolean {
  return (
    position.x + PLAYER_RADIUS > blockX + COLLISION_EPSILON &&
    position.x - PLAYER_RADIUS < blockX + 1 - COLLISION_EPSILON &&
    position.y + PLAYER_HEIGHT > blockY + COLLISION_EPSILON &&
    position.y < blockY + 1 - COLLISION_EPSILON &&
    position.z + PLAYER_RADIUS > blockZ + COLLISION_EPSILON &&
    position.z - PLAYER_RADIUS < blockZ + 1 - COLLISION_EPSILON
  );
}

/** Moves along one axis, clamps against every overlapping solid cell, and returns ground contact. */
function resolveAxis(
  position: Vector3,
  velocity: Vector3,
  movement: number,
  axis: Axis,
  world: World,
): boolean {
  if (movement === 0) {
    return false;
  }
  position[axis] += movement;
  let grounded = false;
  const minX = Math.floor(position.x - PLAYER_RADIUS);
  const maxX = Math.floor(position.x + PLAYER_RADIUS - COLLISION_EPSILON);
  const minY = Math.floor(position.y);
  const maxY = Math.floor(position.y + PLAYER_HEIGHT - COLLISION_EPSILON);
  const minZ = Math.floor(position.z - PLAYER_RADIUS);
  const maxZ = Math.floor(position.z + PLAYER_RADIUS - COLLISION_EPSILON);

  // Only cells intersecting the compact player bounds can influence this axis movement.
  for (let blockY = minY; blockY <= maxY; blockY += 1) {
    for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
      for (let blockX = minX; blockX <= maxX; blockX += 1) {
        if (!world.isSolid(blockX, blockY, blockZ) || !overlapsBlock(position, blockX, blockY, blockZ)) {
          continue;
        }

        // Direction identifies the near voxel face that the player's body may contact safely.
        if (axis === "x") {
          position.x = movement > 0 ? blockX - PLAYER_RADIUS : blockX + 1 + PLAYER_RADIUS;
        } else if (axis === "z") {
          position.z = movement > 0 ? blockZ - PLAYER_RADIUS : blockZ + 1 + PLAYER_RADIUS;
        } else if (movement > 0) {
          position.y = blockY - PLAYER_HEIGHT;
        } else {
          position.y = blockY + 1;
          grounded = true;
        }
        velocity[axis] = 0;
      }
    }
  }
  return grounded;
}

/** Applies one frame of velocity in horizontal-then-vertical order and returns support state. */
export function movePlayerWithCollisions(
  position: Vector3,
  velocity: Vector3,
  deltaSeconds: number,
  world: World,
): CollisionResult {
  resolveAxis(position, velocity, velocity.x * deltaSeconds, "x", world);
  resolveAxis(position, velocity, velocity.z * deltaSeconds, "z", world);
  const grounded = resolveAxis(position, velocity, velocity.y * deltaSeconds, "y", world);
  return { grounded };
}

/** Reports whether a unit block would intersect the player's current body volume. */
export function playerIntersectsBlock(
  position: Vector3,
  blockX: number,
  blockY: number,
  blockZ: number,
): boolean {
  return overlapsBlock(position, blockX, blockY, blockZ);
}


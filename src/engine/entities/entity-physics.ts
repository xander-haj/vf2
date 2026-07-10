/**
 * Resolves generic entity bodies against solid voxel cells using deterministic axis-separated movement.
 * The implementation supports bounded one-block stepping without coupling entity state to player physics.
 */

import { Vector3 } from "three";
import type { EntityInstance } from "./entity-instance";

// Small face insets prevent exact floating-point contact from oscillating between collision states.
const COLLISION_EPSILON = 0.0001;

/** EntityCollisionWorld is the minimal voxel query boundary required by entity physics. */
export interface EntityCollisionWorld {
  isSolid(worldX: number, y: number, worldZ: number): boolean;
}

/** AxisResolution reports collision and downward support for one movement component. */
interface AxisResolution {
  readonly collided: boolean;
  readonly grounded: boolean;
}

/** Reports whether an entity body at position overlaps one unit voxel cell. */
function overlapsBlock(entity: EntityInstance, blockX: number, blockY: number, blockZ: number): boolean {
  const radius = entity.definition.dimensions.width / 2;
  return (
    entity.position.x + radius > blockX + COLLISION_EPSILON &&
    entity.position.x - radius < blockX + 1 - COLLISION_EPSILON &&
    entity.position.y + entity.definition.dimensions.height > blockY + COLLISION_EPSILON &&
    entity.position.y < blockY + 1 - COLLISION_EPSILON &&
    entity.position.z + radius > blockZ + COLLISION_EPSILON &&
    entity.position.z - radius < blockZ + 1 - COLLISION_EPSILON
  );
}

/** Resolves one axis against every voxel intersecting the moved body. */
function resolveAxis(
  entity: EntityInstance,
  movement: number,
  axis: "x" | "y" | "z",
  world: EntityCollisionWorld,
): AxisResolution {
  if (movement === 0) {
    return { collided: false, grounded: false };
  }
  entity.position[axis] += movement;
  const radius = entity.definition.dimensions.width / 2;
  const minX = Math.floor(entity.position.x - radius);
  const maxX = Math.floor(entity.position.x + radius - COLLISION_EPSILON);
  const minY = Math.floor(entity.position.y);
  const maxY = Math.floor(entity.position.y + entity.definition.dimensions.height - COLLISION_EPSILON);
  const minZ = Math.floor(entity.position.z - radius);
  const maxZ = Math.floor(entity.position.z + radius - COLLISION_EPSILON);
  let collided = false;
  let grounded = false;

  // Only cells intersecting the compact body can affect this axis movement.
  for (let blockY = minY; blockY <= maxY; blockY += 1) {
    for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
      for (let blockX = minX; blockX <= maxX; blockX += 1) {
        if (!world.isSolid(blockX, blockY, blockZ) || !overlapsBlock(entity, blockX, blockY, blockZ)) {
          continue;
        }
        collided = true;
        if (axis === "x") {
          entity.position.x = movement > 0 ? blockX - radius : blockX + 1 + radius;
        } else if (axis === "z") {
          entity.position.z = movement > 0 ? blockZ - radius : blockZ + 1 + radius;
        } else if (movement > 0) {
          entity.position.y = blockY - entity.definition.dimensions.height;
        } else {
          entity.position.y = blockY + 1;
          grounded = true;
        }
        entity.velocity[axis] = 0;
      }
    }
  }
  return { collided, grounded };
}

/** Attempts one horizontal component and steps up one block when a grounded body meets a low obstacle. */
function moveHorizontal(
  entity: EntityInstance,
  movement: number,
  axis: "x" | "z",
  world: EntityCollisionWorld,
): void {
  const start = entity.position.clone();
  const resolution = resolveAxis(entity, movement, axis, world);
  if (!resolution.collided || !entity.grounded) {
    return;
  }

  // Restore and retry one block higher; failure returns to the original collision-clamped result.
  const blocked = entity.position.clone();
  entity.position.copy(start).add(new Vector3(0, 1.001, 0));
  const step = resolveAxis(entity, movement, axis, world);
  if (step.collided) {
    entity.position.copy(blocked);
  }
}

/** Advances one entity through horizontal intent, gravity, voxel collision, and ground detection. */
export function updateEntityPhysics(
  entity: EntityInstance,
  world: EntityCollisionWorld,
  deltaSeconds: number,
  gravity: number,
): void {
  entity.previousPosition.copy(entity.position);
  const intentLength = Math.hypot(entity.intent.moveX, entity.intent.moveZ);
  const scale = intentLength > 1 ? 1 / intentLength : 1;
  entity.velocity.x = entity.intent.moveX * scale * entity.definition.speed;
  entity.velocity.z = entity.intent.moveZ * scale * entity.definition.speed;
  entity.velocity.y -= gravity * deltaSeconds;

  moveHorizontal(entity, entity.velocity.x * deltaSeconds, "x", world);
  moveHorizontal(entity, entity.velocity.z * deltaSeconds, "z", world);
  const vertical = resolveAxis(entity, entity.velocity.y * deltaSeconds, "y", world);
  entity.grounded = vertical.grounded;

  // Horizontal intent determines facing even when collision prevents movement.
  if (intentLength > 0.001) {
    entity.yaw = Math.atan2(entity.intent.moveX, entity.intent.moveZ);
  }
}

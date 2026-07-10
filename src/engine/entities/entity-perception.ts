/**
 * Performs bounded distance, field-of-view, and voxel line-of-sight checks for entity target acquisition.
 * Perception is evaluated at a reduced fixed rate by EntityManager rather than once per rendered frame.
 */

import { Vector3 } from "three";
import type { EntityInstance } from "./entity-instance";

/** PerceptionWorld supplies solid-cell queries used to block sight rays. */
export interface PerceptionWorld {
  isSolid(worldX: number, y: number, worldZ: number): boolean;
}

/** Reports whether the segment reaches its target without entering a solid voxel. */
export function hasLineOfSight(world: PerceptionWorld, origin: Vector3, target: Vector3): boolean {
  const delta = target.clone().sub(origin);
  const distance = delta.length();
  if (distance <= 0.001) {
    return true;
  }
  const direction = delta.multiplyScalar(1 / distance);
  const stepLength = 0.25;
  const steps = Math.ceil(distance / stepLength);
  const sample = origin.clone();

  // Quarter-block sampling is bounded by perception range and avoids mesh-dependent raycasting.
  for (let step = 1; step < steps; step += 1) {
    sample.copy(origin).addScaledVector(direction, step * stepLength);
    if (world.isSolid(Math.floor(sample.x), Math.floor(sample.y), Math.floor(sample.z))) {
      return false;
    }
  }
  return true;
}

/** Tests range, horizontal field of view, and voxel visibility against the player eye position. */
export function canPerceivePlayer(
  entity: EntityInstance,
  playerEye: Vector3,
  world: PerceptionWorld,
): boolean {
  return canPerceivePosition(entity, playerEye, world);
}

/** Tests range, horizontal field of view, and voxel visibility against any target eye coordinate. */
export function canPerceivePosition(
  entity: EntityInstance,
  targetEye: Vector3,
  world: PerceptionWorld,
): boolean {
  const eye = entity.position.clone();
  eye.y += entity.definition.dimensions.height * 0.8;
  const toTarget = targetEye.clone().sub(eye);
  const distance = toTarget.length();
  if (distance > entity.definition.perception.range) {
    return false;
  }
  const horizontalLength = Math.hypot(toTarget.x, toTarget.z);
  if (horizontalLength > 0.001) {
    const facingX = Math.sin(entity.yaw);
    const facingZ = Math.cos(entity.yaw);
    const dot = (facingX * toTarget.x + facingZ * toTarget.z) / horizontalLength;
    const minimumDot = Math.cos(entity.definition.perception.fieldOfViewDegrees * Math.PI / 360);
    if (dot < minimumDot) {
      return false;
    }
  }
  return hasLineOfSight(world, eye, targetEye);
}

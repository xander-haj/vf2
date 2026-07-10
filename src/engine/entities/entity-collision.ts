/** Resolves live actor overlap and exposes collider occupancy to block placement. */

import { Vector3 } from "three";
import { PLAYER_HEIGHT, PLAYER_RADIUS } from "../../game/game-config";
import type { EntityInstance } from "./entity-instance";
import { isEntityBodyClear, type EntityNavigationWorld } from "./entity-navigation";

/** Reports whether one entity body overlaps a unit world block. */
export function entityIntersectsBlock(
  entity: EntityInstance,
  blockX: number,
  blockY: number,
  blockZ: number,
): boolean {
  const radius = entity.definition.dimensions.width / 2;
  return entity.position.x + radius > blockX
    && entity.position.x - radius < blockX + 1
    && entity.position.y + entity.definition.dimensions.height > blockY
    && entity.position.y < blockY + 1
    && entity.position.z + radius > blockZ
    && entity.position.z - radius < blockZ + 1;
}

/** Separates overlapping horizontal bodies deterministically after voxel movement. */
export function resolveEntityOverlaps(
  source: Iterable<EntityInstance>,
  playerPosition: Vector3,
  world: EntityNavigationWorld,
): void {
  const entities = [...source].filter((entity) => entity.active && entity.isAlive())
    .sort((left, right) => left.id.localeCompare(right.id));
  for (let iteration = 0; iteration < 8; iteration += 1) {
    for (let firstIndex = 0; firstIndex < entities.length; firstIndex += 1) {
      const first = entities[firstIndex];
      if (first === undefined) continue;
      separateFromPlayer(first, playerPosition, world);
      for (let secondIndex = firstIndex + 1; secondIndex < entities.length; secondIndex += 1) {
        const second = entities[secondIndex];
        if (second !== undefined) separatePair(first, second, world);
      }
    }
  }
}

/** Pushes two vertically overlapping entity bodies equally along their shortest horizontal separation. */
function separatePair(
  first: EntityInstance,
  second: EntityInstance,
  world: EntityNavigationWorld,
): void {
  if (!verticalOverlap(
    first.position.y,
    first.definition.dimensions.height,
    second.position.y,
    second.definition.dimensions.height,
  )) return;
  const minimum = (first.definition.dimensions.width + second.definition.dimensions.width) / 2;
  const deltaX = second.position.x - first.position.x;
  const deltaZ = second.position.z - first.position.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance >= minimum) return;
  const directionX = distance > 0.0001 ? deltaX / distance : 1;
  const directionZ = distance > 0.0001 ? deltaZ / distance : 0;
  const push = (minimum - distance) / 2;
  const firstMoved = tryHorizontalMove(first, -directionX * push, -directionZ * push, world);
  const secondMoved = tryHorizontalMove(second, directionX * push, directionZ * push, world);
  if (!firstMoved && secondMoved) tryHorizontalMove(second, directionX * push, directionZ * push, world);
  if (firstMoved && !secondMoved) tryHorizontalMove(first, -directionX * push, -directionZ * push, world);
}

/** Keeps actors from walking through the player without moving the authoritative player body. */
function separateFromPlayer(
  entity: EntityInstance,
  player: Vector3,
  world: EntityNavigationWorld,
): void {
  if (!verticalOverlap(entity.position.y, entity.definition.dimensions.height, player.y, PLAYER_HEIGHT)) return;
  const minimum = entity.definition.dimensions.width / 2 + PLAYER_RADIUS;
  const deltaX = entity.position.x - player.x;
  const deltaZ = entity.position.z - player.z;
  const distance = Math.hypot(deltaX, deltaZ);
  if (distance >= minimum) return;
  const directionX = distance > 0.0001 ? deltaX / distance : 1;
  const directionZ = distance > 0.0001 ? deltaZ / distance : 0;
  tryHorizontalMove(entity, directionX * (minimum - distance), directionZ * (minimum - distance), world);
}

/** Commits one separation movement only when the complete resulting body remains outside solid voxels. */
function tryHorizontalMove(
  entity: EntityInstance,
  deltaX: number,
  deltaZ: number,
  world: EntityNavigationWorld,
): boolean {
  const nextX = entity.position.x + deltaX;
  const nextZ = entity.position.z + deltaZ;
  if (!isEntityBodyClear(
    world,
    nextX,
    entity.position.y,
    nextZ,
    entity.definition.dimensions.width,
    entity.definition.dimensions.height,
  )) return false;
  entity.position.x = nextX;
  entity.position.z = nextZ;
  return true;
}

/** Tests strict vertical interval overlap for two foot-anchored bodies. */
function verticalOverlap(firstY: number, firstHeight: number, secondY: number, secondHeight: number): boolean {
  return firstY < secondY + secondHeight && firstY + firstHeight > secondY;
}

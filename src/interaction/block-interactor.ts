/**
 * Performs grid-accurate block targeting, selection highlighting, breaking, and safe placement.
 * A voxel traversal is used instead of triangle raycasting so interaction remains exact after remeshing.
 */

import {
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Vector3,
} from "three";
import { BlockId } from "../game/block-types";
import { BLOCK_REACH } from "../game/game-config";
import type { InputController } from "../player/input-controller";
import type { PlayerController } from "../player/player-controller";
import type { World } from "../world/world";

/** Integer coordinates identify one voxel cell without allocating Three.js vectors per traversal step. */
interface BlockCoordinate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A target contains the hit solid cell and the preceding empty cell used for placement. */
interface BlockTarget {
  readonly hit: BlockCoordinate;
  readonly placement: BlockCoordinate;
}

/** InteractionUpdate reports whether world data changed during the current frame. */
export interface InteractionUpdate {
  readonly changedWorld: boolean;
}

/** Calculates ray distance to the next integer boundary on one axis. */
function distanceToBoundary(position: number, direction: number): number {
  if (direction > 0) {
    return (Math.floor(position) + 1 - position) / direction;
  }
  if (direction < 0) {
    return (position - Math.floor(position)) / -direction;
  }
  return Number.POSITIVE_INFINITY;
}

/** Traverses voxel cells in ray order and returns the first solid block within reach. */
function traceVoxels(origin: Vector3, direction: Vector3, world: World): BlockTarget | null {
  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);
  let previous: BlockCoordinate = { x, y, z };
  const stepX = Math.sign(direction.x);
  const stepY = Math.sign(direction.y);
  const stepZ = Math.sign(direction.z);
  const deltaX = direction.x === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.x);
  const deltaY = direction.y === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.y);
  const deltaZ = direction.z === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / direction.z);
  let nextX = distanceToBoundary(origin.x, direction.x);
  let nextY = distanceToBoundary(origin.y, direction.y);
  let nextZ = distanceToBoundary(origin.z, direction.z);
  let distance = 0;

  // Each iteration crosses exactly one nearest grid plane, guaranteeing front-to-back cell order.
  while (distance <= BLOCK_REACH) {
    if (world.getBlock(x, y, z) !== BlockId.Air) {
      return { hit: { x, y, z }, placement: previous };
    }
    previous = { x, y, z };
    if (nextX <= nextY && nextX <= nextZ) {
      x += stepX;
      distance = nextX;
      nextX += deltaX;
    } else if (nextY <= nextZ) {
      y += stepY;
      distance = nextY;
      nextY += deltaY;
    } else {
      z += stepZ;
      distance = nextZ;
      nextZ += deltaZ;
    }
  }
  return null;
}

/** BlockInteractor owns the current target and a reusable wireframe selection indicator. */
export class BlockInteractor {
  private readonly eye = new Vector3();
  private readonly direction = new Vector3();
  private readonly selection: LineSegments;
  private selectedBlock = BlockId.Grass;

  public constructor(
    private readonly camera: PerspectiveCamera,
    private readonly world: World,
    private readonly player: PlayerController,
    private readonly input: InputController,
  ) {
    const selectionBox = new BoxGeometry(1.006, 1.006, 1.006);
    const edges = new EdgesGeometry(selectionBox);
    selectionBox.dispose();
    const material = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    this.selection = new LineSegments(edges, material);
    this.selection.visible = false;
    this.selection.renderOrder = 10;
    this.worldSceneAdd(this.selection);
  }

  /** Adds the selection object through the camera's parent scene without broadening World's public API. */
  private worldSceneAdd(selection: LineSegments): void {
    const scene = this.camera.parent;
    if (scene === null) {
      throw new Error("The interaction system requires the camera to be attached to a scene.");
    }
    scene.add(selection);
  }

  /** Updates the material that right-click placement will use. */
  public setSelectedBlock(blockId: BlockId): void {
    this.selectedBlock = blockId;
  }

  /** Refreshes target highlighting and consumes edit actions only while gameplay is active. */
  public update(active: boolean): InteractionUpdate {
    this.player.getEyePosition(this.eye);
    this.camera.getWorldDirection(this.direction).normalize();
    const target = traceVoxels(this.eye, this.direction, this.world);
    this.selection.visible = target !== null;
    if (target !== null) {
      this.selection.position.set(target.hit.x + 0.5, target.hit.y + 0.5, target.hit.z + 0.5);
    }
    if (!active) {
      return { changedWorld: false };
    }
    if (target === null) {
      // Empty-space clicks are consumed now so they cannot fire later when the crosshair reaches terrain.
      this.input.consumePrimaryAction();
      this.input.consumeSecondaryAction();
      return { changedWorld: false };
    }

    // Breaking takes precedence when both buttons arrive in one browser frame.
    if (this.input.consumePrimaryAction()) {
      return { changedWorld: this.world.setBlock(target.hit.x, target.hit.y, target.hit.z, BlockId.Air) };
    }
    if (this.input.consumeSecondaryAction()) {
      const { x, y, z } = target.placement;
      if (this.world.getBlock(x, y, z) !== BlockId.Air || this.player.occupiesBlock(x, y, z)) {
        return { changedWorld: false };
      }
      return { changedWorld: this.world.setBlock(x, y, z, this.selectedBlock) };
    }
    return { changedWorld: false };
  }

  /** Removes the selection object and disposes its private GPU resources. */
  public dispose(): void {
    this.selection.removeFromParent();
    this.selection.geometry.dispose();
    const material = this.selection.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material.dispose();
    }
  }
}

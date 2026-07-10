/**
 * Creates deterministic physical block drops, animates them in the world, and collects them into player inventory.
 * Loot uses original block metadata and shared primitive geometry without introducing unbounded scene resources.
 */

import {
  BoxGeometry,
  Mesh,
  MeshLambertMaterial,
  Scene,
  Vector3,
} from "three";
import { BlockId, getBlockDefinition, isBlockId } from "../../game/block-types";
import type { LootTableDefinition } from "./entity-model";

// Drop lifetime and pickup radius bound scene objects and make collection predictable.
const DROP_LIFETIME_SECONDS = 90;
const PICKUP_RADIUS = 1.35;

/** LootStack is a concrete block quantity produced by a deterministic loot roll. */
export interface LootStack {
  readonly blockId: BlockId;
  readonly count: number;
}

/** Formats collected stacks with canonical display names for status and editor diagnostics. */
export function formatLootStacks(stacks: readonly LootStack[]): string {
  return stacks.map((stack) => `${stack.count} ${getBlockDefinition(stack.blockId).name}`).join(", ");
}

/** PlayerInventory stores bounded block counts used by pickups and NPC trading. */
export class PlayerInventory {
  private readonly counts = new Map<BlockId, number>();

  /** Returns the current non-negative quantity for one block identifier. */
  public getCount(blockId: BlockId): number {
    return this.counts.get(blockId) ?? 0;
  }

  /** Adds a positive integer quantity and returns the resulting total. */
  public add(blockId: BlockId, count: number): number {
    if (!Number.isInteger(count) || count <= 0) {
      return this.getCount(blockId);
    }
    const total = this.getCount(blockId) + count;
    this.counts.set(blockId, total);
    return total;
  }

  /** Removes a quantity only when the complete cost is available. */
  public remove(blockId: BlockId, count: number): boolean {
    if (!Number.isInteger(count) || count <= 0 || this.getCount(blockId) < count) {
      return false;
    }
    const remaining = this.getCount(blockId) - count;
    if (remaining === 0) {
      this.counts.delete(blockId);
    } else {
      this.counts.set(blockId, remaining);
    }
    return true;
  }

  /** Returns a stable snapshot suitable for HUD presentation or later save integration. */
  public snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(
      [...this.counts.entries()]
        .sort(([left], [right]) => left - right)
        .map(([blockId, count]) => [String(blockId), count]),
    );
  }
}

/** ActiveDrop owns one rendered stack and its bounded animation state. */
interface ActiveDrop {
  readonly stack: LootStack;
  readonly mesh: Mesh;
  readonly baseY: number;
  ageSeconds: number;
}

/** Produces a stable unsigned hash for loot chance and quantity rolls. */
function lootHash(key: string): number {
  let value = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    value ^= key.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Rolls each table entry independently from entity identity so results survive frame-order changes. */
export function rollLoot(table: LootTableDefinition, entityId: string): LootStack[] {
  const stacks: LootStack[] = [];
  table.entries.forEach((entry, index) => {
    if (!isBlockId(entry.blockId)) {
      return;
    }
    const chanceSample = lootHash(`${entityId}:${table.id}:${index}:chance`) / 0x100000000;
    if (chanceSample >= entry.chance) {
      return;
    }
    const range = entry.max - entry.min + 1;
    const countSample = lootHash(`${entityId}:${table.id}:${index}:count`);
    const count = entry.min + (range > 0 ? countSample % range : 0);
    if (count > 0) {
      stacks.push({ blockId: entry.blockId, count });
    }
  });
  return stacks;
}

/** LootSystem owns physical drop meshes, collection, inventory transfer, and resource disposal. */
export class LootSystem {
  private readonly geometry = new BoxGeometry(0.28, 0.28, 0.28);
  private readonly materials = new Map<BlockId, MeshLambertMaterial>();
  private readonly drops: ActiveDrop[] = [];
  public readonly inventory = new PlayerInventory();

  public constructor(private readonly scene: Scene) {}

  /** Adds each rolled stack as a visible block-colored pickup at the death position. */
  public spawn(stacks: readonly LootStack[], position: Vector3): void {
    stacks.forEach((stack, index) => {
      let material = this.materials.get(stack.blockId);
      if (material === undefined) {
        material = new MeshLambertMaterial({ color: getBlockDefinition(stack.blockId).uiColor });
        this.materials.set(stack.blockId, material);
      }
      const mesh = new Mesh(this.geometry, material);
      const angle = index * 2.399963;
      mesh.position.set(position.x + Math.cos(angle) * 0.24, position.y + 0.3, position.z + Math.sin(angle) * 0.24);
      mesh.name = `loot-${stack.blockId}-${stack.count}`;
      this.scene.add(mesh);
      this.drops.push({ stack, mesh, baseY: mesh.position.y, ageSeconds: 0 });
    });
  }

  /** Animates drops, transfers nearby stacks, and removes expired scene resources. */
  public update(deltaSeconds: number, playerPosition: Vector3): LootStack[] {
    const collected: LootStack[] = [];
    for (let index = this.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.drops[index];
      if (drop === undefined) {
        continue;
      }
      drop.ageSeconds += deltaSeconds;
      drop.mesh.rotation.y += deltaSeconds * 1.8;
      drop.mesh.position.y = drop.baseY + Math.sin(drop.ageSeconds * 3) * 0.08;
      const expired = drop.ageSeconds >= DROP_LIFETIME_SECONDS;
      const pickedUp = drop.mesh.position.distanceTo(playerPosition) <= PICKUP_RADIUS;
      if (!expired && !pickedUp) {
        continue;
      }
      if (pickedUp) {
        this.inventory.add(drop.stack.blockId, drop.stack.count);
        collected.push(drop.stack);
      }
      drop.mesh.removeFromParent();
      this.drops.splice(index, 1);
    }
    return collected;
  }

  /** Removes active drops and releases shared geometry and material resources. */
  public dispose(): void {
    this.drops.forEach((drop) => drop.mesh.removeFromParent());
    this.drops.length = 0;
    this.geometry.dispose();
    this.materials.forEach((material) => material.dispose());
    this.materials.clear();
  }
}

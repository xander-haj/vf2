/**
 * Executes bounded NPC block trades atomically against the player's collected-block inventory.
 * Offer use counts live in runtime state and prevent content-defined trades from producing unlimited output.
 */

import { isBlockId } from "../../game/block-types";
import type { TradeOffer, TradeTableDefinition } from "./entity-model";
import type { PlayerInventory } from "./loot-system";

/** TradeResult gives the HUD an exact outcome without exposing inventory mutation details. */
export interface TradeResult {
  readonly success: boolean;
  readonly message: string;
}

/** TradingSystem indexes authored tables and tracks uses per entity and offer. */
export class TradingSystem {
  private readonly tables: ReadonlyMap<string, TradeTableDefinition>;
  private readonly uses = new Map<string, number>();

  public constructor(tables: readonly TradeTableDefinition[]) {
    this.tables = new Map(tables.map((table) => [table.id, table]));
  }

  /** Returns immutable offers for presentation, or an empty list for an unknown table. */
  public getOffers(tableId: string): readonly TradeOffer[] {
    return this.tables.get(tableId)?.offers ?? [];
  }

  /** Restores bounded offer counters stored inside one NPC's durable behavior-state record. */
  public restoreEntityUses(
    entityId: string,
    tableId: string,
    behaviorState: ReadonlyMap<string, number | string | boolean>,
  ): void {
    this.getOffers(tableId).forEach((offer, index) => {
      const value = behaviorState.get(`trade:${tableId}:${index}`);
      if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
        this.uses.set(`${entityId}:${tableId}:${index}`, Math.min(offer.maxUses, value));
      }
    });
  }

  /** Returns one validated runtime use count for persistence after a successful exchange. */
  public getUseCount(entityId: string, tableId: string, offerIndex: number): number {
    return this.uses.get(`${entityId}:${tableId}:${offerIndex}`) ?? 0;
  }

  /** Exchanges one complete cost and result atomically after validating IDs, stock, and use limits. */
  public execute(
    entityId: string,
    tableId: string,
    offerIndex: number,
    inventory: PlayerInventory,
  ): TradeResult {
    const offer = this.tables.get(tableId)?.offers[offerIndex];
    if (
      offer === undefined ||
      !isBlockId(offer.costBlockId) ||
      !isBlockId(offer.resultBlockId)
    ) {
      return { success: false, message: "That trade is unavailable." };
    }
    const useKey = `${entityId}:${tableId}:${offerIndex}`;
    const currentUses = this.uses.get(useKey) ?? 0;
    if (currentUses >= offer.maxUses) {
      return { success: false, message: "That offer is sold out." };
    }
    if (inventory.getCount(offer.costBlockId) < offer.costCount) {
      return { success: false, message: "You do not have the required blocks." };
    }
    if (!inventory.remove(offer.costBlockId, offer.costCount)) {
      return { success: false, message: "The trade cost could not be removed." };
    }
    inventory.add(offer.resultBlockId, offer.resultCount);
    this.uses.set(useKey, currentUses + 1);
    return { success: true, message: "Trade completed." };
  }
}

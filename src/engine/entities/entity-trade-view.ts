/** Converts validated trade offers into player-facing immutable HUD records. */

import { getBlockDefinition, isBlockId } from "../../game/block-types";
import type { TradeOffer } from "./entity-model";

/** ActiveTradeOffer exposes authored quantities with resolved block names. */
export interface ActiveTradeOffer {
  readonly costName: string;
  readonly costCount: number;
  readonly resultName: string;
  readonly resultCount: number;
}

/** Drops malformed runtime records even though compiler validation normally prevents them. */
export function createTradeOfferViews(offers: readonly TradeOffer[]): readonly ActiveTradeOffer[] {
  return offers.flatMap((offer) => {
    if (!isBlockId(offer.costBlockId) || !isBlockId(offer.resultBlockId)) {
      return [];
    }
    return [{
      costName: getBlockDefinition(offer.costBlockId).name,
      costCount: offer.costCount,
      resultName: getBlockDefinition(offer.resultBlockId).name,
      resultCount: offer.resultCount,
    }];
  });
}

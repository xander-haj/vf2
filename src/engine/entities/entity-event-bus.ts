/** Delivers allowlisted authored entity events to runtime and isolated editor subscribers. */

import type { EntityInstance } from "./entity-instance";

/** EntityEvent identifies the actor and authored event without carrying executable content. */
export interface EntityEvent {
  readonly entityId: string;
  readonly eventId: string;
}

/** EntityEventBus owns listener lifetime and drains bounded per-entity event queues. */
export class EntityEventBus {
  private readonly listeners = new Set<(event: EntityEvent) => void>();

  /** Registers one listener and returns its exact idempotent unsubscribe function. */
  public subscribe(listener: (event: EntityEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Delivers and clears every queued event after simulation component updates commit. */
  public drain(entities: Iterable<EntityInstance>): void {
    for (const entity of entities) {
      for (const eventId of entity.pendingEvents.splice(0)) {
        const event = { entityId: entity.id, eventId };
        this.listeners.forEach((listener) => {
          try {
            listener(event);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown entity event listener error";
            console.error(`[EntityEventBus] Listener failed for ${eventId}: ${message}`);
          }
        });
      }
    }
  }

  /** Releases subscribers when the owning entity manager shuts down. */
  public clear(): void {
    this.listeners.clear();
  }
}

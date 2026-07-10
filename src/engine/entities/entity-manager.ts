/**
 * Orchestrates entity spawning, behavior, navigation, physics, combat, rendering, loot, dialogue, and persistence.
 * The manager is the only frame-level entity boundary consumed by Game and block interaction.
 */
// Runtime systems and generated contracts are imported explicitly to keep orchestration dependencies reviewable.
import { Scene, Vector3 } from "three";
import { BLOCK_REACH, GRAVITY } from "../../game/game-config";
import { BehaviorRunner } from "./behavior-runner";
import { DialogueSystem, type ActiveDialogue } from "./dialogue-system";
import { EntityAssetLoader } from "./entity-asset-loader";
import { EntityAnimationLibrary } from "./entity-animation-library";
import { updateCoordinatedCombat } from "./entity-combat-coordinator";
import { EntityInstance } from "./entity-instance";
import { entityIntersectsBlock, resolveEntityOverlaps } from "./entity-collision";
import { EntityEventBus, type EntityEvent } from "./entity-event-bus";
import {
  createEntityDebugSnapshots,
  type EntityDebugSnapshot,
} from "./entity-debug";
import { findEntityTarget } from "./entity-interactor";
import type {
  EntityDefinition,
  LootTableDefinition,
  PersistedEntityState,
} from "./entity-model";
import { updateEntityPhysics } from "./entity-physics";
import { EntityRenderer } from "./entity-renderer";
import { EntitySpawner } from "./entity-spawner";
import { formatLootStacks, LootSystem, rollLoot } from "./loot-system";
import {
  collectPersistentEntityStates,
  restoreEntityPersistence,
} from "./entity-persistence";
import { TradingSystem, type TradeResult } from "./trading-system";
import {
  createTradeOfferViews,
  type ActiveTradeOffer,
} from "./entity-trade-view";
import type {
  EntityInteractionResult,
  EntityManagerPlayer,
  EntityManagerWorld,
  EntityPersistenceBoundary,
  EntityRuntimeContent,
} from "./entity-runtime";
import {
  findHostileTarget,
  resolveTargetEye,
  resolveTargetPosition,
} from "./entity-targeting";

// Simulation radii keep live AI bounded while preserving persistent NPCs outside the active region.
const ENTITY_ACTIVE_RADIUS = 48;
const ENTITY_SLEEP_RADIUS = 72;
const BEHAVIOR_INTERVAL_SECONDS = 0.1;
const SAVE_INTERVAL_SECONDS = 2;
const PLAYER_ATTACK_DAMAGE = 5;
/** EntityManager owns all live and sleeping actor state plus cross-system update order. */
export class EntityManager {
  private readonly definitions: ReadonlyMap<string, EntityDefinition>;
  private readonly behaviors: ReadonlyMap<string, BehaviorRunner>;
  private readonly lootTables: ReadonlyMap<string, LootTableDefinition>;
  private readonly entities = new Map<string, EntityInstance>();
  private readonly sleeping = new Map<string, PersistedEntityState>();
  private readonly renderer: EntityRenderer;
  private readonly animations: EntityAnimationLibrary;
  private readonly spawner: EntitySpawner;
  private readonly loot: LootSystem;
  private readonly dialogue: DialogueSystem;
  private readonly trading: TradingSystem;
  private readonly playerEye = new Vector3();
  private readonly events = new EntityEventBus();
  private saveAccumulatorSeconds = 0;
  private editorSpawnSequence = 0;
  /** Constructs indexed runtime systems from one validated generated content snapshot. */
  public constructor(
    scene: Scene,
    private readonly world: EntityManagerWorld,
    private readonly player: EntityManagerPlayer,
    private readonly persistence: EntityPersistenceBoundary,
    content: EntityRuntimeContent,
    private readonly onStatus: (message: string) => void,
  ) {
    this.definitions = new Map(content.definitions.map((definition) => [definition.id, definition]));
    this.behaviors = new Map(
      content.behaviors.map((graph) => [graph.id, new BehaviorRunner(graph)]),
    );
    this.lootTables = new Map(content.lootTables.map((table) => [table.id, table]));
    this.animations = new EntityAnimationLibrary(content.animationSets);
    this.renderer = new EntityRenderer(
      scene,
      new EntityAssetLoader(content.assets),
      this.animations,
    );
    this.spawner = new EntitySpawner(content.definitions, content.spawnRules);
    this.loot = new LootSystem(scene);
    this.dialogue = new DialogueSystem(content.dialogues);
    this.trading = new TradingSystem(content.trades);
    this.restorePersistence();
  }
  /** Restores validated NPC states and player inventory before spawn evaluation begins. */
  private restorePersistence(): void {
    restoreEntityPersistence(this.persistence, this.definitions, this.sleeping, this.loot.inventory);
  }
  /** Advances spawning, waking, AI, movement, combat, rendering, drops, and periodic persistence. */
  public update(deltaSeconds: number): void {
    const playerPosition = this.player.getPosition();
    this.wakeNearbyPersistentEntities(playerPosition);
    this.spawnNearbyEntities(playerPosition);
    this.player.getEyePosition(this.playerEye);

    for (const entity of [...this.entities.values()]) {
      if (!entity.isAlive()) {
        this.handleDeath(entity);
        continue;
      }
      const distance = entity.position.distanceTo(playerPosition);
      if (distance > ENTITY_SLEEP_RADIUS) {
        this.sleepOrDespawn(entity);
        continue;
      }
      entity.active = distance <= ENTITY_ACTIVE_RADIUS;
      if (!entity.active) {
        continue;
      }
      entity.advanceTimers(deltaSeconds);
      entity.behaviorAccumulatorSeconds += deltaSeconds;
      if (entity.behaviorAccumulatorSeconds >= BEHAVIOR_INTERVAL_SECONDS) {
        this.updateBehavior(entity, entity.behaviorAccumulatorSeconds, playerPosition);
        entity.behaviorAccumulatorSeconds = 0;
      }
      updateEntityPhysics(entity, this.world, deltaSeconds, GRAVITY);
      const combat = updateCoordinatedCombat(
        entity,
        this.entities,
        this.player,
        this.world,
        this.animations,
      );
      if (combat.playerAttacked) {
        this.onStatus(
          combat.playerDefeated ? "You were defeated." : `${entity.definition.displayName} hit you.`,
        );
      }
      if (combat.defeatedEntity !== null) this.handleDeath(combat.defeatedEntity);
      if (!entity.isAlive()) {
        this.handleDeath(entity);
      }
    }
    resolveEntityOverlaps(this.entities.values(), playerPosition, this.world);
    this.events.drain(this.entities.values());
    this.entities.forEach((entity) => this.renderer.update(entity, deltaSeconds));

    const collected = this.loot.update(deltaSeconds, playerPosition);
    if (collected.length > 0) {
      this.onStatus(`Collected ${formatLootStacks(collected)}.`);
    }
    this.saveAccumulatorSeconds += deltaSeconds;
    if (this.saveAccumulatorSeconds >= SAVE_INTERVAL_SECONDS) {
      this.saveAccumulatorSeconds = 0;
      this.savePersistentState();
    }
  }

  /** Runs one authored behavior graph with current player and world context. */
  private updateBehavior(entity: EntityInstance, deltaSeconds: number, playerPosition: Vector3): void {
    const runner = this.behaviors.get(entity.definition.behaviorGraphId);
    if (runner === undefined) {
      entity.clearIntent();
      return;
    }
    runner.update(entity, {
      world: this.world,
      playerPosition,
      playerEye: this.playerEye,
      playerAlive: this.player.isAlive(),
      deltaSeconds,
      resolveTargetPosition: (target) => resolveTargetPosition(target, this.entities, this.player),
      resolveTargetEye: (target) => resolveTargetEye(target, this.entities, this.player),
      acquireHostileTarget: (seeker) => findHostileTarget(
        seeker,
        this.entities.values(),
        this.player,
        this.world,
      ),
    });
  }

  /** Creates deterministic nearby groups without exceeding authored per-definition population caps. */
  private spawnNearbyEntities(playerPosition: Vector3): void {
    const occupied = new Set([...this.entities.keys(), ...this.sleeping.keys()]);
    const population = new Map<string, number>();
    this.entities.forEach((entity) => {
      population.set(entity.definition.id, (population.get(entity.definition.id) ?? 0) + 1);
    });
    this.sleeping.forEach((state) => {
      population.set(state.definitionId, (population.get(state.definitionId) ?? 0) + 1);
    });
    const requests = this.spawner.update(this.world, playerPosition, occupied, population, 2);
    requests.forEach((request) => {
      const entity = new EntityInstance(request.id, request.definition, request.position);
      this.entities.set(entity.id, entity);
      void this.renderer.add(entity);
    });
  }

  /** Restores sleeping persistent NPCs once their saved position returns to the active region. */
  private wakeNearbyPersistentEntities(playerPosition: Vector3): void {
    this.sleeping.forEach((state, id) => {
      if (state.health <= 0) {
        return;
      }
      const position = new Vector3().fromArray(state.position);
      if (position.distanceTo(playerPosition) > ENTITY_SLEEP_RADIUS) {
        return;
      }
      const definition = this.definitions.get(state.definitionId);
      if (definition === undefined || definition.definitionVersion !== state.definitionVersion) {
        return;
      }
      const entity = new EntityInstance(id, definition, position, state);
      if (definition.tradeTableId !== undefined) {
        this.trading.restoreEntityUses(id, definition.tradeTableId, entity.behaviorState);
      }
      this.entities.set(id, entity);
      this.sleeping.delete(id);
      void this.renderer.add(entity);
    });
  }

  /** Persists NPCs while allowing ordinary hostile and passive populations to despawn naturally. */
  private sleepOrDespawn(entity: EntityInstance): void {
    if (entity.definition.persistence === "persistent" && entity.isAlive()) {
      this.sleeping.set(entity.id, entity.serialize());
    }
    this.renderer.remove(entity.id);
    this.entities.delete(entity.id);
  }

  /** Rolls physical drops, closes conversations, and removes one defeated entity. */
  private handleDeath(entity: EntityInstance): void {
    if (!this.entities.has(entity.id)) return;
    if (entity.definition.persistence === "persistent") {
      this.sleeping.set(entity.id, entity.serialize());
    }
    const table = this.lootTables.get(entity.definition.lootTableId);
    if (table !== undefined) {
      this.loot.spawn(rollLoot(table, entity.id), entity.position);
    }
    if (this.dialogue.getActive()?.entityId === entity.id) {
      this.dialogue.close();
    }
    this.renderer.remove(entity.id);
    this.entities.delete(entity.id);
    this.onStatus(`${entity.definition.displayName} was defeated.`);
  }

  /** Applies a player attack to the nearest targeted entity before block interaction is considered. */
  public attackFromRay(
    origin: Vector3,
    direction: Vector3,
    maximumDistance = BLOCK_REACH,
  ): EntityInteractionResult {
    const hit = findEntityTarget(origin, direction, this.entities.values(), maximumDistance);
    if (hit === null) {
      return { handled: false, message: null };
    }
    const damage = hit.entity.takeDamage(
      PLAYER_ATTACK_DAMAGE,
      this.animations.getHurtDuration(hit.entity.definition),
    );
    if (damage.applied && hit.entity.definition.hostileTo.includes("vf:player")) {
      hit.entity.target = { kind: "player" };
      hit.entity.targetMemorySeconds = hit.entity.definition.perception.memorySeconds;
    }
    const result = {
      handled: damage.applied,
      message: damage.applied ? `Hit ${hit.entity.definition.displayName}.` : null,
    };
    if (result.message !== null) {
      this.onStatus(result.message);
    }
    if (damage.died) {
      this.handleDeath(hit.entity);
    }
    return result;
  }

  /** Starts NPC dialogue for the nearest targeted actor with authored conversation content. */
  public interactFromRay(
    origin: Vector3,
    direction: Vector3,
    maximumDistance = BLOCK_REACH,
  ): EntityInteractionResult {
    const hit = findEntityTarget(origin, direction, this.entities.values(), maximumDistance);
    const dialogueId = hit?.entity.definition.dialogueId;
    if (hit === null || dialogueId === undefined) {
      return { handled: false, message: null };
    }
    const active = this.dialogue.begin(hit.entity.id, dialogueId);
    return { handled: active !== null, message: active?.text ?? null };
  }

  /** Advances the active conversation through one visible choice. */
  public chooseDialogue(index: number): ActiveDialogue | null {
    return this.dialogue.choose(index);
  }

  /** Executes one offer for the NPC owning the active conversation. */
  public executeTrade(offerIndex: number): TradeResult {
    const active = this.dialogue.getActive();
    const entity = active === null ? undefined : this.entities.get(active.entityId);
    const tableId = entity?.definition.tradeTableId;
    if (entity === undefined || tableId === undefined) {
      return { success: false, message: "No trader is active." };
    }
    const result = this.trading.execute(entity.id, tableId, offerIndex, this.loot.inventory);
    if (result.success) {
      entity.behaviorState.set(
        `trade:${tableId}:${offerIndex}`,
        this.trading.getUseCount(entity.id, tableId, offerIndex),
      );
    }
    return result;
  }

  /** Returns the active immutable conversation snapshot for HUD rendering. */
  public getActiveDialogue(): ActiveDialogue | null {
    return this.dialogue.getActive();
  }

  /** Returns the active trader's complete offer list for HUD buttons. */
  public getActiveTradeOffers(): readonly ActiveTradeOffer[] {
    const active = this.dialogue.getActive();
    const entity = active === null ? undefined : this.entities.get(active.entityId);
    const tableId = entity?.definition.tradeTableId;
    if (tableId === undefined) {
      return [];
    }
    return createTradeOfferViews(this.trading.getOffers(tableId));
  }

  /** Returns detached snapshots for an isolated editor scene's live blackboard inspector. */
  public getDebugSnapshots(): readonly EntityDebugSnapshot[] {
    return createEntityDebugSnapshots(this.entities.values());
  }

  /** Creates an actor through the normal runtime and renderer for isolated editor test scenes. */
  public spawnForTest(definitionId: string, position: Vector3): string | null {
    const definition = this.definitions.get(definitionId);
    if (definition === undefined || !position.toArray().every(Number.isFinite)) {
      return null;
    }
    const id = `editor:${definitionId}:${this.editorSpawnSequence}`;
    this.editorSpawnSequence += 1;
    const entity = new EntityInstance(id, definition, position);
    this.entities.set(id, entity);
    void this.renderer.add(entity);
    return id;
  }

  /** Applies ordinary entity damage in isolated editor combat tests and reports whether it landed. */
  public damageForTest(entityId: string, amount: number): boolean {
    const entity = this.entities.get(entityId);
    return entity?.takeDamage(
      amount,
      entity === undefined ? 0.18 : this.animations.getHurtDuration(entity.definition),
    ).applied ?? false;
  }

  /** Reports whether a live actor collider occupies a proposed block placement cell. */
  public occupiesBlock(blockX: number, blockY: number, blockZ: number): boolean {
    return [...this.entities.values()].some((entity) => (
      entity.active && entity.isAlive() && entityIntersectsBlock(entity, blockX, blockY, blockZ)
    ));
  }

  /** Subscribes to committed safe behavior events and returns an idempotent unsubscribe function. */
  public subscribeToEvents(listener: (event: EntityEvent) => void): () => void {
    return this.events.subscribe(listener);
  }

  /** Serializes all live NPCs, sleeping NPCs, and collected block inventory through world storage. */
  private savePersistentState(): void {
    const states = collectPersistentEntityStates(this.sleeping, this.entities.values());
    this.persistence.recordEntityState(states, this.loot.inventory.snapshot());
  }

  /** Saves durable state and releases render, asset, drop, and entity resources. */
  public dispose(): void {
    this.savePersistentState();
    this.dialogue.close();
    this.renderer.dispose();
    this.loot.dispose();
    this.events.clear();
    this.entities.clear();
    this.sleeping.clear();
  }
}

/**
 * Executes validated behavior trees using a fixed set of safe conditions and actions.
 * Authored graphs select reviewed operations and cannot evaluate JavaScript or arbitrary command strings.
 */
// Simulation, perception, navigation, and graph contracts form the safe behavior execution boundary.
import { Vector3 } from "three";
import type { EntityInstance } from "./entity-instance";
import {
  canPerceivePlayer,
  canPerceivePosition,
  hasLineOfSight,
  type PerceptionWorld,
} from "./entity-perception";
import { findEntityPath, followEntityPath, type EntityNavigationWorld } from "./entity-navigation";
import type { BehaviorGraphDefinition, BehaviorNodeDefinition, EntityTarget } from "./entity-model";

/** BehaviorStatus follows standard tree semantics for selectors, sequences, and long-running actions. */
type BehaviorStatus = "success" | "failure" | "running";

/** BehaviorContext supplies immutable frame inputs without giving graph data direct system access. */
export interface BehaviorContext {
  readonly world: PerceptionWorld & EntityNavigationWorld;
  readonly playerPosition: Vector3;
  readonly playerEye: Vector3;
  readonly playerAlive: boolean;
  readonly deltaSeconds: number;
  readonly resolveTargetPosition: (target: EntityTarget | null) => Vector3 | null;
  readonly resolveTargetEye: (target: EntityTarget | null) => Vector3 | null;
  readonly acquireHostileTarget: (entity: EntityInstance) => EntityTarget | null;
}

/** Produces a stable unsigned hash for deterministic behavior choices. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Reads one finite numeric node parameter with an explicit fallback. */
function numberParameter(node: BehaviorNodeDefinition, name: string, fallback: number): number {
  const value = node.parameters?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Reads one string node parameter without coercing untrusted content values. */
function stringParameter(node: BehaviorNodeDefinition, name: string): string | null {
  const value = node.parameters?.[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** BehaviorRunner indexes one immutable graph and evaluates it for any matching entity definition. */
export class BehaviorRunner {
  private readonly nodes: ReadonlyMap<string, BehaviorNodeDefinition>;

  public constructor(private readonly graph: BehaviorGraphDefinition) {
    this.nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  }

  /** Runs the graph root after clearing stale one-frame intent. */
  public update(entity: EntityInstance, context: BehaviorContext): void {
    entity.clearIntent();
    this.evaluateNode(entity, this.graph.rootNodeId, context, new Set<string>());
  }

  /** Evaluates one node with a recursion guard even though compiler validation already rejects graph cycles. */
  private evaluateNode(
    entity: EntityInstance,
    nodeId: string,
    context: BehaviorContext,
    ancestors: Set<string>,
  ): BehaviorStatus {
    const node = this.nodes.get(nodeId);
    if (node === undefined || ancestors.has(nodeId)) {
      return "failure";
    }
    const nextAncestors = new Set(ancestors).add(nodeId);
    switch (node.type) {
      case "selector":
        return this.evaluateSelector(entity, node, context, nextAncestors);
      case "sequence":
        return this.evaluateSequence(entity, node, context, nextAncestors);
      case "condition":
        return this.evaluateCondition(entity, node, context) ? "success" : "failure";
      case "action":
        return this.evaluateAction(entity, node, context);
      case "cooldown":
        return this.evaluateCooldown(entity, node, context, nextAncestors);
      case "repeat":
        return this.evaluateRepeat(entity, node, context, nextAncestors);
    }
  }

  /** Returns the first successful or running child, failing only when every alternative fails. */
  private evaluateSelector(
    entity: EntityInstance,
    node: BehaviorNodeDefinition,
    context: BehaviorContext,
    ancestors: Set<string>,
  ): BehaviorStatus {
    for (const child of node.children ?? []) {
      const result = this.evaluateNode(entity, child, context, ancestors);
      if (result !== "failure") {
        return result;
      }
    }
    return "failure";
  }

  /** Requires children to succeed in order and stops immediately on failure or running work. */
  private evaluateSequence(
    entity: EntityInstance,
    node: BehaviorNodeDefinition,
    context: BehaviorContext,
    ancestors: Set<string>,
  ): BehaviorStatus {
    for (const child of node.children ?? []) {
      const result = this.evaluateNode(entity, child, context, ancestors);
      if (result !== "success") {
        return result;
      }
    }
    return "success";
  }

  /** Evaluates the complete allowlisted condition vocabulary. */
  private evaluateCondition(
    entity: EntityInstance,
    node: BehaviorNodeDefinition,
    context: BehaviorContext,
  ): boolean {
    const targetPosition = context.resolveTargetPosition(entity.target);
    const targetEye = context.resolveTargetEye(entity.target);
    switch (node.condition) {
      case "player_alive":
        return context.playerAlive;
      case "has_target":
        return targetPosition !== null && entity.targetMemorySeconds > 0;
      case "can_see_player":
        return context.playerAlive && canPerceivePlayer(entity, context.playerEye, context.world);
      case "target_in_attack_range":
        if (targetPosition === null || targetEye === null) return false;
        if (entity.position.distanceTo(targetPosition) > entity.definition.attack.range) return false;
        return hasLineOfSight(context.world, this.getEye(entity), targetEye);
      case "can_see_target":
        if (targetEye === null || !canPerceivePosition(entity, targetEye, context.world)) return false;
        entity.targetMemorySeconds = entity.definition.perception.memorySeconds;
        return true;
      case "health_below_ratio":
        return entity.health / entity.definition.maxHealth < numberParameter(node, "ratio", 0.3);
      case "player_in_interaction_range":
        return entity.position.distanceTo(context.playerPosition) <= numberParameter(node, "range", 3);
      case "is_hostile":
        return entity.definition.hostileTo.length > 0;
      default:
        return false;
    }
  }

  /** Returns one entity eye coordinate for combat visibility checks. */
  private getEye(entity: EntityInstance): Vector3 {
    const eye = entity.position.clone();
    eye.y += entity.definition.dimensions.height * 0.8;
    return eye;
  }

  /** Executes the complete allowlisted action vocabulary and authors intent for later systems. */
  private evaluateAction(
    entity: EntityInstance,
    node: BehaviorNodeDefinition,
    context: BehaviorContext,
  ): BehaviorStatus {
    switch (node.action) {
      case "idle":
        return "success";
      case "wait":
        return this.wait(entity, node);
      case "acquire_player":
        return this.acquirePlayer(entity, context);
      case "acquire_hostile":
        return this.acquireHostile(entity, context);
      case "look_at_player":
        this.lookAt(entity, context.playerPosition);
        return "success";
      case "look_at_target":
        return this.lookAtTarget(entity, context);
      case "random_stroll":
      case "patrol":
        return this.randomStroll(entity, node);
      case "chase_target":
      case "follow_target":
        return this.followTarget(entity, context);
      case "flee_player":
        return this.fleePlayer(entity, context.playerPosition);
      case "melee_attack":
        entity.intent.attack = true;
        return this.lookAtTarget(entity, context);
      case "ranged_attack":
        entity.intent.rangedAttack = true;
        return this.lookAtTarget(entity, context);
      case "interact_player":
        entity.intent.interact = true;
        this.lookAt(entity, context.playerPosition);
        return "success";
      case "clear_target":
        entity.target = null;
        entity.targetMemorySeconds = 0;
        return "success";
      case "play_animation":
        return this.playAnimation(entity, node);
      case "emit_event":
        return this.emitEvent(entity, node);
      case "change_state":
        return this.changeState(entity, node);
      default:
        return "failure";
    }
  }

  /** Waits against simulation age so pauses and frame rates cannot change completion order. */
  private wait(entity: EntityInstance, node: BehaviorNodeDefinition): BehaviorStatus {
    const key = `wait:${node.id}`;
    const readyAt = Number(entity.behaviorState.get(key) ?? entity.ageSeconds + numberParameter(node, "seconds", 1));
    if (!entity.behaviorState.has(key)) entity.behaviorState.set(key, readyAt);
    if (entity.ageSeconds < readyAt) return "running";
    entity.behaviorState.delete(key);
    return "success";
  }

  /** Acquires the nearest visible faction target declared by authored hostility data. */
  private acquireHostile(entity: EntityInstance, context: BehaviorContext): BehaviorStatus {
    const target = context.acquireHostileTarget(entity);
    if (target === null) return "failure";
    entity.target = target;
    entity.targetMemorySeconds = entity.definition.perception.memorySeconds;
    return "success";
  }

  /** Faces the current generic player-or-entity target. */
  private lookAtTarget(entity: EntityInstance, context: BehaviorContext): BehaviorStatus {
    const target = context.resolveTargetPosition(entity.target);
    if (target === null) return "failure";
    this.lookAt(entity, target);
    return "success";
  }

  /** Requests one validated animation state for an authored bounded duration. */
  private playAnimation(entity: EntityInstance, node: BehaviorNodeDefinition): BehaviorStatus {
    const animationId = stringParameter(node, "animationId");
    if (animationId === null) return "failure";
    entity.requestedAnimationId = animationId;
    entity.requestedAnimationSeconds = Math.max(0.05, numberParameter(node, "durationSeconds", 0.2));
    return "success";
  }

  /** Queues a namespaced event for manager subscribers without executing content-provided code. */
  private emitEvent(entity: EntityInstance, node: BehaviorNodeDefinition): BehaviorStatus {
    const eventId = stringParameter(node, "eventId");
    if (eventId === null || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(eventId)) return "failure";
    if (entity.pendingEvents.length < 32) entity.pendingEvents.push(eventId);
    return "success";
  }

  /** Stores one primitive blackboard value beneath an authored state key. */
  private changeState(entity: EntityInstance, node: BehaviorNodeDefinition): BehaviorStatus {
    const key = stringParameter(node, "key");
    const value = node.parameters?.value;
    if (key === null || value === undefined) return "failure";
    entity.behaviorState.set(`state:${key}`, value);
    return "success";
  }

  /** Acquires the player only through the same bounded perception contract used by later memory refreshes. */
  private acquirePlayer(entity: EntityInstance, context: BehaviorContext): BehaviorStatus {
    if (!context.playerAlive || !canPerceivePlayer(entity, context.playerEye, context.world)) {
      return "failure";
    }
    entity.target = { kind: "player" };
    entity.targetMemorySeconds = entity.definition.perception.memorySeconds;
    return "success";
  }

  /** Produces deterministic wandering from entity identity and a bounded time bucket. */
  private randomStroll(entity: EntityInstance, node: BehaviorNodeDefinition): BehaviorStatus {
    const interval = Math.max(0.5, numberParameter(node, "intervalSeconds", 3));
    const bucket = Math.floor(entity.ageSeconds / interval);
    const hash = hashString(`${entity.id}:${node.id}:${bucket}`);
    const idleChance = numberParameter(node, "idleChance", 0.25);
    if (hash / 0x100000000 < idleChance) {
      return "success";
    }
    const angle = ((hash >>> 8) / 0xffffff) * Math.PI * 2;
    entity.intent.moveX = Math.sin(angle);
    entity.intent.moveZ = Math.cos(angle);
    entity.intent.lookX = entity.intent.moveX;
    entity.intent.lookZ = entity.intent.moveZ;
    return "running";
  }

  /** Refreshes a bounded A* path and follows the remembered player or entity target. */
  private followTarget(entity: EntityInstance, context: BehaviorContext): BehaviorStatus {
    const target = context.resolveTargetPosition(entity.target);
    if (target === null || entity.targetMemorySeconds <= 0) {
      return "failure";
    }
    if (entity.navigationCooldownSeconds <= 0) {
      entity.navigationPath.splice(
        0,
        entity.navigationPath.length,
        ...findEntityPath(
          context.world,
          entity.position,
          target,
          entity.definition.dimensions.width,
          entity.definition.dimensions.height,
        ),
      );
      entity.navigationCooldownSeconds = 0.75;
    }
    return followEntityPath(entity) ? "running" : "failure";
  }

  /** Moves directly away from the player while preserving normalized movement intent. */
  private fleePlayer(entity: EntityInstance, playerPosition: Vector3): BehaviorStatus {
    const deltaX = entity.position.x - playerPosition.x;
    const deltaZ = entity.position.z - playerPosition.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance <= 0.001) {
      return "failure";
    }
    entity.intent.moveX = deltaX / distance;
    entity.intent.moveZ = deltaZ / distance;
    entity.intent.lookX = entity.intent.moveX;
    entity.intent.lookZ = entity.intent.moveZ;
    return "running";
  }

  /** Points entity facing intent toward one world position without moving it. */
  private lookAt(entity: EntityInstance, target: Vector3): void {
    const deltaX = target.x - entity.position.x;
    const deltaZ = target.z - entity.position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > 0.001) {
      entity.intent.lookX = deltaX / distance;
      entity.intent.lookZ = deltaZ / distance;
      entity.yaw = Math.atan2(entity.intent.lookX, entity.intent.lookZ);
    }
  }

  /** Gates one child behind a per-entity timestamp stored under the node's stable ID. */
  private evaluateCooldown(
    entity: EntityInstance,
    node: BehaviorNodeDefinition,
    context: BehaviorContext,
    ancestors: Set<string>,
  ): BehaviorStatus {
    const child = node.children?.[0];
    const readyAt = Number(entity.behaviorState.get(`cooldown:${node.id}`) ?? 0);
    if (child === undefined || entity.ageSeconds < readyAt) {
      return "failure";
    }
    const result = this.evaluateNode(entity, child, context, ancestors);
    if (result === "success") {
      entity.behaviorState.set(`cooldown:${node.id}`, entity.ageSeconds + Math.max(0, node.seconds ?? 0));
    }
    return result;
  }

  /** Repeats one immediate child a bounded number of times and propagates running work safely. */
  private evaluateRepeat(
    entity: EntityInstance,
    node: BehaviorNodeDefinition,
    context: BehaviorContext,
    ancestors: Set<string>,
  ): BehaviorStatus {
    const child = node.children?.[0];
    const count = Math.max(1, Math.min(16, Math.floor(node.count ?? 1)));
    if (child === undefined) {
      return "failure";
    }
    for (let iteration = 0; iteration < count; iteration += 1) {
      const result = this.evaluateNode(entity, child, context, ancestors);
      if (result !== "success") {
        return result;
      }
    }
    return "success";
  }
}

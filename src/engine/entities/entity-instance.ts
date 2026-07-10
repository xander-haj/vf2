/**
 * Owns one entity's mutable simulation state independently from rendering and authored definitions.
 * Instances can serialize all durable state without exposing Three.js resources to persistence code.
 */

import { Vector3 } from "three";
import type {
  EntityDamageResult,
  EntityDefinition,
  EntityIntent,
  EntityTarget,
  PersistedEntityState,
} from "./entity-model";

/** EntityInstance contains physical, behavioral, combat, and persistence state for one live actor. */
export class EntityInstance {
  public readonly position: Vector3;
  public readonly previousPosition: Vector3;
  public readonly velocity: Vector3;
  public readonly intent: EntityIntent = {
    moveX: 0,
    moveZ: 0,
    lookX: 0,
    lookZ: 1,
    attack: false,
    rangedAttack: false,
    interact: false,
  };
  public readonly behaviorState = new Map<string, number | string | boolean>();
  public readonly navigationPath: Vector3[] = [];
  public yaw: number;
  public health: number;
  public ageSeconds: number;
  public grounded = false;
  public active = true;
  public target: EntityTarget | null = null;
  public targetMemorySeconds = 0;
  public attackCooldownSeconds = 0;
  public navigationCooldownSeconds = 0;
  public behaviorAccumulatorSeconds = 0;
  public hurtFeedbackSeconds = 0;
  public attackAnimationSeconds = 0;
  public requestedAnimationId: string | null = null;
  public requestedAnimationSeconds = 0;
  public readonly pendingEvents: string[] = [];

  public constructor(
    public readonly id: string,
    public readonly definition: EntityDefinition,
    position: Vector3,
    persisted?: PersistedEntityState,
  ) {
    this.position = position.clone();
    this.previousPosition = position.clone();
    this.velocity = new Vector3();
    this.yaw = 0;
    this.health = definition.maxHealth;
    this.ageSeconds = 0;

    // Persisted values replace defaults only after the storage boundary has validated their complete shape.
    if (persisted !== undefined) {
      this.position.fromArray(persisted.position);
      this.previousPosition.copy(this.position);
      this.velocity.fromArray(persisted.velocity);
      this.yaw = persisted.yaw;
      this.health = Math.max(0, Math.min(definition.maxHealth, persisted.health));
      this.ageSeconds = persisted.ageSeconds;
      this.grounded = persisted.grounded;
      this.target = persisted.target;
      this.targetMemorySeconds = persisted.targetMemorySeconds;
      this.attackCooldownSeconds = persisted.attackCooldownSeconds;
      this.navigationCooldownSeconds = persisted.navigationCooldownSeconds;
      this.behaviorAccumulatorSeconds = persisted.behaviorAccumulatorSeconds;
      this.hurtFeedbackSeconds = persisted.hurtFeedbackSeconds;
      this.attackAnimationSeconds = persisted.attackAnimationSeconds;
      this.requestedAnimationId = persisted.requestedAnimationId;
      this.requestedAnimationSeconds = persisted.requestedAnimationSeconds;
      persisted.navigationPath.forEach((point) => this.navigationPath.push(new Vector3().fromArray(point)));
      Object.entries(persisted.behaviorState).forEach(([key, value]) => {
        this.behaviorState.set(key, value);
      });
    }
  }

  /** Resets one-frame intent before behavior systems author the next simulation request. */
  public clearIntent(): void {
    this.intent.moveX = 0;
    this.intent.moveZ = 0;
    this.intent.attack = false;
    this.intent.rangedAttack = false;
    this.intent.interact = false;
  }

  /** Advances bounded timers that are shared by behavior, combat, navigation, and render feedback. */
  public advanceTimers(deltaSeconds: number): void {
    this.ageSeconds += deltaSeconds;
    this.targetMemorySeconds = Math.max(0, this.targetMemorySeconds - deltaSeconds);
    this.attackCooldownSeconds = Math.max(0, this.attackCooldownSeconds - deltaSeconds);
    this.navigationCooldownSeconds = Math.max(0, this.navigationCooldownSeconds - deltaSeconds);
    this.hurtFeedbackSeconds = Math.max(0, this.hurtFeedbackSeconds - deltaSeconds);
    this.attackAnimationSeconds = Math.max(0, this.attackAnimationSeconds - deltaSeconds);
    this.requestedAnimationSeconds = Math.max(0, this.requestedAnimationSeconds - deltaSeconds);
    if (this.requestedAnimationSeconds === 0) this.requestedAnimationId = null;
  }

  /** Applies bounded damage once and reports both rejection and death outcomes. */
  public takeDamage(amount: number, feedbackSeconds = 0.18): EntityDamageResult {
    if (!Number.isFinite(amount) || amount <= 0 || this.health <= 0) {
      return { applied: false, died: this.health <= 0 };
    }
    this.health = Math.max(0, this.health - amount);
    this.hurtFeedbackSeconds = Math.max(0.05, feedbackSeconds);
    return { applied: true, died: this.health === 0 };
  }

  /** Reports whether the entity remains eligible for behavior, physics, and rendering. */
  public isAlive(): boolean {
    return this.health > 0;
  }

  /** Converts durable state into the exact versioned shape accepted by world persistence. */
  public serialize(): PersistedEntityState {
    return {
      version: 2,
      id: this.id,
      definitionId: this.definition.id,
      definitionVersion: this.definition.definitionVersion,
      position: [this.position.x, this.position.y, this.position.z],
      velocity: [this.velocity.x, this.velocity.y, this.velocity.z],
      yaw: this.yaw,
      health: this.health,
      ageSeconds: this.ageSeconds,
      grounded: this.grounded,
      target: this.target,
      targetMemorySeconds: this.targetMemorySeconds,
      attackCooldownSeconds: this.attackCooldownSeconds,
      navigationCooldownSeconds: this.navigationCooldownSeconds,
      behaviorAccumulatorSeconds: this.behaviorAccumulatorSeconds,
      hurtFeedbackSeconds: this.hurtFeedbackSeconds,
      attackAnimationSeconds: this.attackAnimationSeconds,
      requestedAnimationId: this.requestedAnimationId,
      requestedAnimationSeconds: this.requestedAnimationSeconds,
      navigationPath: this.navigationPath.map(
        (point): [number, number, number] => [point.x, point.y, point.z],
      ),
      behaviorState: Object.fromEntries(this.behaviorState),
    };
  }
}

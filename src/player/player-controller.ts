/**
 * Implements first-person orientation, movement intent, gravity, jumping, and camera placement.
 * The controller owns player state while delegating environment collision to the voxel resolver.
 */

import { MathUtils, PerspectiveCamera, Vector3 } from "three";
import {
  GRAVITY,
  JUMP_SPEED,
  LOOK_SENSITIVITY,
  PLAYER_EYE_HEIGHT,
  PLAYER_HURT_COOLDOWN,
  PLAYER_MAX_HEALTH,
  PLAYER_RESPAWN_DELAY,
  SPRINT_SPEED,
  WALK_SPEED,
} from "../game/game-config";
import type { World } from "../world/world";
import { movePlayerWithCollisions, playerIntersectsBlock } from "./collision";
import type { InputController } from "./input-controller";

// Pitch stops just short of vertical to avoid disorienting Euler singularities.
const MAX_PITCH = Math.PI / 2 - 0.01;

/** PlayerController advances physical player state and keeps the camera at eye height. */
export class PlayerController {
  private readonly position: Vector3;
  private readonly spawnPosition: Vector3;
  private readonly velocity = new Vector3();
  private grounded = false;
  private yaw = 0;
  private pitch = 0;
  private health = PLAYER_MAX_HEALTH;
  private hurtCooldownSeconds = 0;
  private respawnSeconds = 0;

  public constructor(
    private readonly camera: PerspectiveCamera,
    spawnPosition: Vector3,
  ) {
    this.position = spawnPosition.clone();
    this.spawnPosition = spawnPosition.clone();
    this.camera.rotation.order = "YXZ";
    this.syncCamera();
  }

  /** Copies physical position and orientation into the render camera after every state change. */
  private syncCamera(): void {
    this.camera.position.set(
      this.position.x,
      this.position.y + PLAYER_EYE_HEIGHT,
      this.position.z,
    );
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.z = 0;
  }

  /** Converts device-independent movement intent into horizontal world velocity aligned with current view yaw. */
  private updateHorizontalVelocity(input: InputController): void {
    const movement = input.getMovementInput();
    const forwardInput = movement.forward;
    const rightInput = movement.right;
    const inputLength = Math.hypot(forwardInput, rightInput);
    if (inputLength === 0) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      return;
    }
    const speed = input.isSprintPressed() ? SPRINT_SPEED : WALK_SPEED;
    const inputMagnitude = Math.min(1, inputLength);
    const normalizedForward = forwardInput / inputLength;
    const normalizedRight = rightInput / inputLength;

    // Yaw zero looks down negative Z, so these basis vectors match Three.js camera orientation.
    const forwardX = -Math.sin(this.yaw);
    const forwardZ = -Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);
    this.velocity.x = (forwardX * normalizedForward + rightX * normalizedRight) * speed * inputMagnitude;
    this.velocity.z = (forwardZ * normalizedForward + rightZ * normalizedRight) * speed * inputMagnitude;
  }

  /** Advances view and physics by one active gameplay frame. */
  public update(deltaSeconds: number, input: InputController, world: World): void {
    this.hurtCooldownSeconds = Math.max(0, this.hurtCooldownSeconds - deltaSeconds);
    if (!this.isAlive()) {
      input.consumeMouseDelta(deltaSeconds);
      this.respawnSeconds = Math.max(0, this.respawnSeconds - deltaSeconds);
      if (this.respawnSeconds === 0) {
        this.respawn();
      }
      return;
    }
    const mouse = input.consumeMouseDelta(deltaSeconds);
    this.yaw -= mouse.x * LOOK_SENSITIVITY;
    this.pitch = MathUtils.clamp(this.pitch - mouse.y * LOOK_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
    this.updateHorizontalVelocity(input);

    // Jumping consumes grounded state immediately so holding Space cannot create repeated midair impulses.
    if (this.grounded && input.isJumpPressed()) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
    }
    this.velocity.y -= GRAVITY * deltaSeconds;
    const collision = movePlayerWithCollisions(this.position, this.velocity, deltaSeconds, world);
    this.grounded = collision.grounded;
    this.syncCamera();
  }

  /** Returns the authoritative feet position for streaming and placement checks. */
  public getPosition(): Vector3 {
    return this.position;
  }

  /** Copies the camera's current eye coordinate into a caller-owned vector. */
  public getEyePosition(target: Vector3): Vector3 {
    return target.copy(this.camera.position);
  }

  /** Applies bounded combat damage once per hurt window and reports whether the hit landed. */
  public takeDamage(amount: number): boolean {
    if (!this.isAlive() || this.hurtCooldownSeconds > 0 || !Number.isFinite(amount) || amount <= 0) {
      return false;
    }
    this.health = Math.max(0, this.health - amount);
    this.hurtCooldownSeconds = PLAYER_HURT_COOLDOWN;
    if (this.health === 0) {
      this.respawnSeconds = PLAYER_RESPAWN_DELAY;
      this.velocity.set(0, 0, 0);
    }
    return true;
  }

  /** Reports whether combat and movement systems may currently act on the player. */
  public isAlive(): boolean {
    return this.health > 0;
  }

  /** Returns current and maximum health for accessible HUD rendering. */
  public getHealth(): Readonly<{ current: number; maximum: number }> {
    return { current: this.health, maximum: PLAYER_MAX_HEALTH };
  }

  /** Restores the complete physical player state at the world's safe initial spawn. */
  private respawn(): void {
    this.position.copy(this.spawnPosition);
    this.velocity.set(0, 0, 0);
    this.health = PLAYER_MAX_HEALTH;
    this.hurtCooldownSeconds = PLAYER_HURT_COOLDOWN;
    this.grounded = false;
    this.syncCamera();
  }

  /** Reports whether placing a unit block at the requested cell would trap the player. */
  public occupiesBlock(blockX: number, blockY: number, blockZ: number): boolean {
    return playerIntersectsBlock(this.position, blockX, blockY, blockZ);
  }
}

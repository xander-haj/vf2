/**
 * Owns entity scene objects, animation mixers, transform interpolation, procedural gait, and render cleanup.
 * Simulation supplies plain EntityInstance state and never mutates Three.js resources directly.
 */

import {
  AnimationMixer,
  type AnimationAction,
  Object3D,
  Scene,
  Vector3,
} from "three";
import type { EntityInstance } from "./entity-instance";
import { EntityAssetLoader } from "./entity-asset-loader";
import { EntityAnimationLibrary } from "./entity-animation-library";

/** EntityRenderHandle tracks one scene root and its optional authored animation mixer. */
interface EntityRenderHandle {
  readonly root: Object3D;
  readonly mixer: AnimationMixer | null;
  readonly clips: ReadonlyMap<string, AnimationAction>;
  readonly baseScale: Vector3;
  readonly leftLeg: Object3D | null;
  readonly rightLeg: Object3D | null;
  readonly leftArm: Object3D | null;
  readonly rightArm: Object3D | null;
  readonly body: Object3D | null;
  activeAction: AnimationAction | null;
}

/** EntityRenderer maps live instance IDs to independently positioned render hierarchies. */
export class EntityRenderer {
  private readonly handles = new Map<string, EntityRenderHandle>();
  private readonly pending = new Map<string, symbol>();

  public constructor(
    private readonly scene: Scene,
    private readonly assets: EntityAssetLoader,
    private readonly animations: EntityAnimationLibrary,
  ) {}

  /** Loads and attaches one entity model exactly once, tolerating removal during asynchronous loading. */
  public async add(entity: EntityInstance): Promise<void> {
    if (this.handles.has(entity.id) || this.pending.has(entity.id)) {
      return;
    }
    const requestToken = Symbol(entity.id);
    this.pending.set(entity.id, requestToken);
    try {
      const asset = await this.assets.instantiate(entity.definition.modelAssetId);
      if (this.pending.get(entity.id) !== requestToken) {
        return;
      }
      const mixer = asset.animations.length > 0 ? new AnimationMixer(asset.root) : null;
      const clips = new Map(asset.animations.map((clip) => [clip.name, mixer!.clipAction(clip)]));
      asset.root.name = `entity-${entity.id}`;
      this.scene.add(asset.root);
      this.handles.set(entity.id, {
        root: asset.root,
        mixer,
        clips,
        baseScale: asset.root.scale.clone(),
        leftLeg: asset.root.getObjectByName("left_leg") ?? asset.root.getObjectByName("left-leg") ?? null,
        rightLeg: asset.root.getObjectByName("right_leg") ?? asset.root.getObjectByName("right-leg") ?? null,
        leftArm: asset.root.getObjectByName("left_arm") ?? asset.root.getObjectByName("left-arm") ?? null,
        rightArm: asset.root.getObjectByName("right_arm") ?? asset.root.getObjectByName("right-arm") ?? null,
        body: asset.root.getObjectByName("body") ?? null,
        activeAction: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown entity asset error";
      console.error(`[EntityRenderer] Could not create ${entity.definition.id}: ${message}`);
    } finally {
      if (this.pending.get(entity.id) === requestToken) this.pending.delete(entity.id);
    }
  }

  /** Interpolates transforms and advances authored or procedural animation for one rendered frame. */
  public update(entity: EntityInstance, deltaSeconds: number, interpolation = 1): void {
    const handle = this.handles.get(entity.id);
    if (handle === undefined) {
      void this.add(entity);
      return;
    }
    handle.root.position.lerpVectors(entity.previousPosition, entity.position, interpolation);
    handle.root.rotation.y = entity.yaw;
    const horizontalSpeed = Math.hypot(entity.velocity.x, entity.velocity.z);
    const animation = this.animations.get(entity.definition);
    const state = animation?.states.find((candidate) => horizontalSpeed <= candidate.speedMaximum)
      ?? animation?.states.at(-1);
    const animationId = entity.hurtFeedbackSeconds > 0
      ? "hurt"
      : entity.attackAnimationSeconds > 0
        ? "attack"
        : entity.requestedAnimationId ?? state?.id ?? "idle";
    this.updateAuthoredClip(handle, animationId);
    handle.mixer?.update(deltaSeconds);

    // Procedural models use named legs when no authored clips are available.
    if (handle.mixer === null) {
      const cycleSeconds = Math.max(0.05, state?.cycleSeconds ?? 0.7);
      const phase = Math.sin(entity.ageSeconds * Math.PI * 2 / cycleSeconds);
      const legSwing = (state?.legSwingDegrees ?? 28) * Math.PI / 180;
      const armSwing = (state?.armSwingDegrees ?? 24) * Math.PI / 180;
      const stride = phase * legSwing;
      const moving = horizontalSpeed > 0.08;
      handle.root.position.y += moving ? Math.abs(phase) * 0.035 : phase * 0.012;
      if (handle.leftLeg !== null) handle.leftLeg.rotation.x = stride;
      if (handle.rightLeg !== null) handle.rightLeg.rotation.x = -stride;
      if (handle.leftArm !== null) handle.leftArm.rotation.x = -phase * armSwing;
      if (handle.rightArm !== null) handle.rightArm.rotation.x = phase * armSwing;
      if (entity.attackAnimationSeconds > 0 && animation !== undefined && handle.rightArm !== null) {
        handle.rightArm.rotation.x = -animation.attack.armSwingDegrees * Math.PI / 180;
      }
      if (handle.body !== null) {
        const tilt = animation?.hurt.bodyTiltDegrees ?? 8;
        handle.body.rotation.z = entity.hurtFeedbackSeconds > 0 ? tilt * Math.PI / 180 : 0;
      }
    }
    const hurtScale = entity.hurtFeedbackSeconds > 0 ? 1.08 : 1;
    handle.root.scale.copy(handle.baseScale).multiplyScalar(hurtScale);
    handle.root.visible = entity.active && entity.isAlive();
  }

  /** Crossfades one matching glTF clip without ever playing unrelated clips simultaneously. */
  private updateAuthoredClip(handle: EntityRenderHandle, animationId: string): void {
    if (handle.mixer === null) return;
    const firstClip = handle.clips.values().next().value as AnimationAction | undefined;
    const next = handle.clips.get(animationId) ?? handle.clips.get("idle") ?? firstClip;
    if (next === undefined || next === handle.activeAction) return;
    handle.activeAction?.fadeOut(0.12);
    next.reset().fadeIn(0.12).play();
    handle.activeAction = next;
  }

  /** Removes one scene hierarchy while leaving shared source resources under loader ownership. */
  public remove(entityId: string): void {
    this.pending.delete(entityId);
    const handle = this.handles.get(entityId);
    if (handle === undefined) {
      return;
    }
    handle.mixer?.stopAllAction();
    handle.root.removeFromParent();
    this.handles.delete(entityId);
  }

  /** Removes all instances and then releases cached source geometry, materials, and animations. */
  public dispose(): void {
    this.pending.clear();
    this.handles.forEach((handle) => {
      handle.mixer?.stopAllAction();
      handle.root.removeFromParent();
    });
    this.handles.clear();
    void this.assets.dispose();
  }
}

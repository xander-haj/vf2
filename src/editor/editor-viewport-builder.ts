/** Handles procedural-model ray picking, grid-plane placement, and selected-piece highlighting. */

import {
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from "three";

/** AssetBuilderPick identifies either an existing cuboid or an empty point on the active construction layer. */
export interface AssetBuilderPick {
  readonly partIndex: number | null;
  readonly point: readonly [number, number, number] | null;
}

type AssetBuilderHandler = (pick: AssetBuilderPick) => void;

/** EditorViewportBuilder owns builder-only picking state without expanding general preview responsibilities. */
export class EditorViewportBuilder {
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly point = new Vector3();
  private readonly grid = new GridHelper(12, 48, 0x75c58b, 0x2e5940);
  private handler: AssetBuilderHandler | null = null;
  private selectedPart: number | null = null;

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: PerspectiveCamera,
    scene: Scene,
    private readonly getPreview: () => Object3D | null,
  ) {
    this.grid.visible = false;
    scene.add(this.grid);
  }

  /** Enables or disables model interaction and positions the horizontal placement plane. */
  public setInteraction(handler: AssetBuilderHandler | null, layer: number): void {
    this.handler = handler;
    this.plane.constant = -Math.max(0, layer);
    this.grid.position.y = Math.max(0, layer) + 0.002;
    this.grid.visible = handler !== null;
  }

  /** Highlights one authored part index and clears highlighting from all other preview meshes. */
  public setSelection(index: number | null): void {
    this.selectedPart = index;
    this.applySelection();
  }

  /** Reapplies selection after a state change reconstructs the transient preview hierarchy. */
  public applySelection(): void {
    const preview = this.getPreview();
    preview?.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const selected = object.userData.assetPartIndex === this.selectedPart;
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        material.emissive.setHex(selected ? 0x4f7f96 : 0x000000);
        material.emissiveIntensity = selected ? 0.65 : 1;
      }
    });
  }

  /** Converts one short canvas click into an existing-part selection or active-layer placement point. */
  public pick(clientX: number, clientY: number): void {
    if (this.handler === null) return;
    const preview = this.getPreview();
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - bounds.left) / Math.max(1, bounds.width)) * 2 - 1,
      -((clientY - bounds.top) / Math.max(1, bounds.height)) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = preview === null ? undefined : this.raycaster.intersectObject(preview, true).find((item) => (
      typeof item.object.userData.assetPartIndex === "number"
    ));
    if (hit !== undefined) {
      this.handler({ partIndex: hit.object.userData.assetPartIndex as number, point: null });
      return;
    }
    const point = this.raycaster.ray.intersectPlane(this.plane, this.point);
    if (point !== null) this.handler({ partIndex: null, point: [point.x, point.y, point.z] });
  }

  /** Releases the dedicated construction grid without affecting the viewport's normal reference grid. */
  public dispose(): void {
    this.grid.removeFromParent();
    this.grid.geometry.dispose();
    const materials = Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material];
    materials.forEach((material) => material.dispose());
  }
}

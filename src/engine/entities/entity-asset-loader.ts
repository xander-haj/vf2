/**
 * Loads and caches procedural or GLB entity models while keeping source resource ownership centralized.
 * Runtime instances clone cached scene graphs, and only the loader disposes shared geometry and materials.
 */

import {
  AnimationClip,
  BufferGeometry,
  BoxGeometry,
  Group,
  Material,
  Mesh,
  MeshLambertMaterial,
  Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

/** ProceduralModelPart describes one original colored box in a generated entity model. */
export interface ProceduralModelPart {
  readonly name: string;
  readonly size: readonly [number, number, number];
  readonly position: readonly [number, number, number];
  readonly color: string;
}

/** EntityAssetDefinition supports local procedural models and open glTF runtime assets. */
export interface EntityAssetDefinition {
  readonly id: string;
  readonly type: "procedural-entity-model" | "gltf";
  readonly source?: string;
  readonly scale?: number;
  readonly parts?: readonly ProceduralModelPart[];
}

/** LoadedEntityAsset combines the cloneable scene root with all authored animation clips. */
export interface LoadedEntityAsset {
  readonly root: Object3D;
  readonly animations: readonly AnimationClip[];
}

/** Disposes unique materials and geometry reachable from one cached source scene. */
function disposeSource(root: Object3D): void {
  const materials = new Set<Material>();
  const geometries = new Set<BufferGeometry>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach((material) => {
      materials.add(material);
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/** EntityAssetLoader owns validated asset definitions, asynchronous loading, cloning, and disposal. */
export class EntityAssetLoader {
  private readonly definitions: ReadonlyMap<string, EntityAssetDefinition>;
  private readonly sources = new Map<string, Promise<LoadedEntityAsset>>();
  private readonly gltfLoader = new GLTFLoader();

  public constructor(definitions: readonly EntityAssetDefinition[]) {
    this.definitions = new Map(definitions.map((definition) => [definition.id, definition]));
  }

  /** Loads one cached source and returns an independent scene hierarchy with shared immutable GPU resources. */
  public async instantiate(assetId: string): Promise<LoadedEntityAsset> {
    let source = this.sources.get(assetId);
    if (source === undefined) {
      const definition = this.definitions.get(assetId);
      if (definition === undefined) {
        throw new Error(`Entity asset ${assetId} is not registered.`);
      }
      source = this.loadSource(definition);
      this.sources.set(assetId, source);
    }
    const loaded = await source;
    return { root: clone(loaded.root), animations: loaded.animations };
  }

  /** Selects the complete local procedural or glTF loading path for one definition. */
  private async loadSource(definition: EntityAssetDefinition): Promise<LoadedEntityAsset> {
    if (definition.type === "procedural-entity-model") {
      return this.createProceduralSource(definition);
    }
    const source = definition.source;
    // Runtime repeats compiler path checks because unsaved editor previews can reach this boundary before validation.
    if (
      source === undefined
      || !/^\/assets\/[A-Za-z0-9_./-]+\.glb$/.test(source)
      || source.split("/").includes("..")
    ) {
      throw new Error(`glTF entity asset ${definition.id} must reference a local /assets/ path.`);
    }
    const loaded = await this.gltfLoader.loadAsync(source);
    loaded.scene.scale.setScalar(definition.scale ?? 1);
    return { root: loaded.scene, animations: loaded.animations };
  }

  /** Creates one original box-model hierarchy from complete authored part definitions. */
  private createProceduralSource(definition: EntityAssetDefinition): LoadedEntityAsset {
    if (definition.parts === undefined || definition.parts.length === 0) {
      throw new Error(`Procedural entity asset ${definition.id} must define at least one part.`);
    }
    const root = new Group();
    root.name = definition.id;
    root.scale.setScalar(definition.scale ?? 1);
    definition.parts.forEach((part) => {
      const geometry = new BoxGeometry(part.size[0], part.size[1], part.size[2]);
      const material = new MeshLambertMaterial({ color: part.color });
      const mesh = new Mesh(geometry, material);
      mesh.name = part.name;
      mesh.position.fromArray(part.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    });
    return { root, animations: [] };
  }

  /** Releases every successfully loaded source without double-disposing cloned shared resources. */
  public async dispose(): Promise<void> {
    const sources = [...this.sources.values()];
    this.sources.clear();
    const settled = await Promise.allSettled(sources);
    settled.forEach((result) => {
      if (result.status === "fulfilled") {
        disposeSource(result.value.root);
      }
    });
  }
}

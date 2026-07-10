/**
 * Converts chunk block data into indexed geometry containing only visible cube faces.
 * Neighbor queries cross chunk boundaries so adjacent loaded chunks join without internal surfaces.
 */

import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  type Material,
} from "three";
import {
  BlockId,
  blockOccludesFaces,
  getBlockTexture,
  type BlockFace,
} from "../game/block-types";
import { CHUNK_SIZE, WORLD_HEIGHT } from "../game/game-config";
import type { TextureAtlas } from "../game/texture-atlas";
import type { Chunk } from "./chunk";

/** One face definition supplies its outward neighbor, normal, vertices, and texture category. */
interface FaceDefinition {
  readonly neighbor: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly vertices: readonly (readonly [number, number, number])[];
  readonly textureFace: BlockFace;
}

// Vertex order is counter-clockwise when viewed from outside each cube, preserving back-face culling.
const FACE_DEFINITIONS: readonly FaceDefinition[] = [
  {
    neighbor: [1, 0, 0],
    normal: [1, 0, 0],
    vertices: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    textureFace: "side",
  },
  {
    neighbor: [-1, 0, 0],
    normal: [-1, 0, 0],
    vertices: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
    textureFace: "side",
  },
  {
    neighbor: [0, 1, 0],
    normal: [0, 1, 0],
    vertices: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    textureFace: "top",
  },
  {
    neighbor: [0, -1, 0],
    normal: [0, -1, 0],
    vertices: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    textureFace: "bottom",
  },
  {
    neighbor: [0, 0, 1],
    normal: [0, 0, 1],
    vertices: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    textureFace: "side",
  },
  {
    neighbor: [0, 0, -1],
    normal: [0, 0, -1],
    vertices: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
    textureFace: "side",
  },
];

/** ChunkMesher builds renderable meshes using shared material and atlas resources. */
export class ChunkMesher {
  public constructor(
    private readonly material: Material,
    private readonly atlas: TextureAtlas,
  ) {}

  /** Appends one indexed quad and its atlas UVs to the growing geometry buffers. */
  private appendFace(
    positions: number[],
    normals: number[],
    uvs: number[],
    indices: number[],
    localX: number,
    y: number,
    localZ: number,
    blockId: BlockId,
    face: FaceDefinition,
  ): void {
    const firstVertex = positions.length / 3;
    const uvBounds = this.atlas.getUvBounds(getBlockTexture(blockId, face.textureFace));

    // Four vertices are intentionally duplicated per face so hard normals and separate UV tiles remain exact.
    face.vertices.forEach(([x, vertexY, z]) => {
      positions.push(localX + x, y + vertexY, localZ + z);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    });
    uvs.push(
      uvBounds.uMin, uvBounds.vMin,
      uvBounds.uMin, uvBounds.vMax,
      uvBounds.uMax, uvBounds.vMax,
      uvBounds.uMax, uvBounds.vMin,
    );
    indices.push(
      firstVertex,
      firstVertex + 1,
      firstVertex + 2,
      firstVertex,
      firstVertex + 2,
      firstVertex + 3,
    );
  }

  /** Builds a mesh for one chunk, consulting the world callback for every adjacent block. */
  public buildMesh(
    chunk: Chunk,
    getWorldBlock: (worldX: number, y: number, worldZ: number) => BlockId,
  ): Mesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const worldStartX = chunk.chunkX * CHUNK_SIZE;
    const worldStartZ = chunk.chunkZ * CHUNK_SIZE;

    // Every non-air block contributes only faces whose neighboring block does not hide them.
    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
          const blockId = chunk.getBlock(localX, y, localZ);
          if (blockId === BlockId.Air) {
            continue;
          }
          FACE_DEFINITIONS.forEach((face) => {
            const neighbor = getWorldBlock(
              worldStartX + localX + face.neighbor[0],
              y + face.neighbor[1],
              worldStartZ + localZ + face.neighbor[2],
            );
            if (!blockOccludesFaces(neighbor)) {
              this.appendFace(positions, normals, uvs, indices, localX, y, localZ, blockId, face);
            }
          });
        }
      }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();

    const mesh = new Mesh(geometry, this.material);
    mesh.position.set(worldStartX, 0, worldStartZ);
    mesh.name = `chunk-${chunk.chunkX}-${chunk.chunkZ}`;
    return mesh;
  }
}


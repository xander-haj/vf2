# Learned History — Minecraft Clone

## Architecture

- The project is a dependency-light browser voxel sandbox built with strict TypeScript, Three.js, and Vite.
- The world is divided into deterministic 16-by-64-by-16 chunks and stores only player edits in local storage.
- Rendering uses one procedurally generated texture atlas and meshes only faces adjacent to non-occluding blocks.
- Player collision uses axis-separated AABB resolution, while block targeting uses grid-accurate voxel traversal.
- Game source is split by responsibility so every implementation file remains below the 400-line ceiling.


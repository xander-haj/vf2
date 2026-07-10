/**
 * Generated from content/assets/assets.json and consumed by the entity asset loader.
 * Procedural definitions ship complete renderable geometry without relying on unavailable binary files.
 */

/** ASSET_DEFINITIONS contains the deeply readonly model catalog. */
export const ASSET_DEFINITIONS = [
  {
    id: "vf:cartographer_model",
    type: "procedural-entity-model",
    ownership: { author: "Voxel Frontier Project", license: "Project-Original", source: "generated" },
    parts: [
      { name: "body", size: [0.72, 0.9, 0.4], position: [0, 1.05, 0], color: "#3f6f8f" },
      { name: "head", size: [0.58, 0.58, 0.58], position: [0, 1.78, 0], color: "#c89a72" },
      { name: "left_leg", size: [0.25, 0.72, 0.28], position: [-0.2, 0.36, 0], color: "#343c4b" },
      { name: "right_leg", size: [0.25, 0.72, 0.28], position: [0.2, 0.36, 0], color: "#343c4b" },
    ],
  },
  {
    id: "vf:stoneback_model",
    type: "procedural-entity-model",
    ownership: { author: "Voxel Frontier Project", license: "Project-Original", source: "generated" },
    parts: [
      { name: "body", size: [0.95, 0.8, 0.65], position: [0, 0.8, 0], color: "#59635e" },
      { name: "head", size: [0.65, 0.6, 0.6], position: [0, 1.45, -0.18], color: "#6f786f" },
      { name: "left_arm", size: [0.28, 0.75, 0.3], position: [-0.62, 0.82, 0], color: "#4f5853" },
      { name: "right_arm", size: [0.28, 0.75, 0.3], position: [0.62, 0.82, 0], color: "#4f5853" },
    ],
  },
  {
    id: "vf:mossling_model",
    type: "procedural-entity-model",
    ownership: { author: "Voxel Frontier Project", license: "Project-Original", source: "generated" },
    parts: [
      { name: "body", size: [0.75, 0.58, 0.95], position: [0, 0.52, 0], color: "#60763b" },
      { name: "head", size: [0.58, 0.5, 0.55], position: [0, 0.88, -0.48], color: "#78944a" },
      { name: "left_ear", size: [0.16, 0.28, 0.14], position: [-0.22, 1.2, -0.48], color: "#8aa758" },
      { name: "right_ear", size: [0.16, 0.28, 0.14], position: [0.22, 1.2, -0.48], color: "#8aa758" },
      { name: "left_leg", size: [0.2, 0.42, 0.22], position: [-0.23, 0.21, -0.2], color: "#4f6431" },
      { name: "right_leg", size: [0.2, 0.42, 0.22], position: [0.23, 0.21, -0.2], color: "#4f6431" },
    ],
  },
] as const;

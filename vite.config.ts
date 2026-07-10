/**
 * Configures Vite output for both local use and location-independent static hosting.
 * Relative asset URLs allow one build to run at a GitHub Pages root or repository subpath.
 */

import { defineConfig } from "vite";
import { editorBridgePlugin } from "./tools/editor-bridge/editor-bridge-plugin.mjs";

export default defineConfig(({ mode }) => ({
  // GitHub Pages project sites live below /repository/, so assets cannot assume the domain root.
  base: "./",
  // The authenticated source-write bridge exists only in explicit local editor serve mode.
  plugins: mode === "editor" ? [editorBridgePlugin()] : [],
}));

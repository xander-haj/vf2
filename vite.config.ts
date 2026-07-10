/**
 * Configures Vite output for both local use and location-independent static hosting.
 * Relative asset URLs allow one build to run at a GitHub Pages root or repository subpath.
 */

import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages project sites live below /repository/, so assets cannot assume the domain root.
  base: "./",
});


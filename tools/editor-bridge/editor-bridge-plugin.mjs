/** Vite plugin that exposes source writes only in an authenticated loopback editor process. */

import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createContentService } from "./content-service.mjs";

/** Creates a fresh token per process; Vite injects it only into the editor document. */
export function editorBridgePlugin(options = {}) {
  const token = randomBytes(32).toString("base64url");
  let servicePromise;
  return {
    name: "voxel-frontier-editor-bridge",
    apply: "serve",
    config() {
      return { server: { host: "127.0.0.1", strictPort: true } };
    },
    // The middleware is registered only for Vite's serve lifecycle; production builds receive no write endpoint.
    configureServer(server) {
      const root = resolve(options.root ?? server.config.root);
      servicePromise = createContentService(root);
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?", 1)[0] ?? "";
        if (path.endsWith("editor.html") || path === "/editor") {
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Referrer-Policy", "same-origin");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.setHeader("Content-Security-Policy", [
            "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:", "connect-src 'self' ws:", "object-src 'none'",
            "base-uri 'none'", "frame-ancestors 'none'",
          ].join("; "));
        }
        if (!path.startsWith("/__vf_editor/")) return next();
        try {
          const service = await servicePromise;
          return await service.handle(request, response, token);
        } catch (error) {
          server.config.logger.error(`[VoxelFrontierEditor] Content service initialization failed: ${String(error)}`);
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          return response.end(JSON.stringify({ error: "The local content service could not initialize." }));
        }
      });
    },
    // Only editor.html receives the secret capability; the playable game document never sees it.
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        if (!context.path.endsWith("editor.html")) return html;
        const meta = `<meta name="vf-editor-token" content="${token}">`;
        return html.replace("<head>", `<head>\n    ${meta}`);
      },
    },
  };
}

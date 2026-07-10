# Bugfix History — GitHub Pages

## 2026-07-09 15:45 — BUG_FIXED

**Bug:** GitHub Actions stopped during `tsc --noEmit` with TS2882 because `src/main.ts` imports `./styles.css`.  
**Root cause:** The installed Vite package declares `*.css` modules in `vite/client.d.ts`, but the TypeScript source set
did not contain an ambient reference to `vite/client`, so TypeScript 7 could not resolve the side-effect import.  
**Fix applied:** Added `src/vite-env.d.ts` with a `vite/client` type reference, making Vite's static-asset declarations
part of the existing `include: ["src"]` compiler scope.  
**Files changed:** src/vite-env.d.ts  
**Verification:** Static inspection confirmed `src/vite-env.d.ts` is included by `tsconfig.json` and its referenced
`node_modules/vite/client.d.ts` declares `*.css`. Xander must run `npm run build` for executable verification.  


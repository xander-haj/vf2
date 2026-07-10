# Learned History — GitHub Pages

## Deployment Architecture

- Vite uses `base: "./"` so emitted asset references work for both root Pages sites and `/repository/` project sites.
- The workflow installs exactly `package-lock.json` with `npm ci` and publishes only the generated `dist/` directory.
- Official GitHub actions are pinned to full commits to prevent mutable major tags from changing executed workflow code.
- GitHub Pages deployment requires `pages: write`, `id-token: write`, and the protected `github-pages` environment.
- Repository Settings must select GitHub Actions as the Pages publishing source before the first deployment.


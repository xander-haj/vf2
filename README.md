# Voxel Frontier

Voxel Frontier is an original single-player creative voxel sandbox for modern desktop browsers. It provides seeded
terrain, chunk streaming, first-person movement, block collision, breaking and placement, a seven-slot hotbar, and
automatic local world persistence. Its procedural artwork and source code do not use Minecraft or Mojang assets.

## Features

- Deterministic hills, stone layers, sandy lowlands, and cross-chunk trees
- Chunked 16 × 64 × 16 world storage with a five-by-five active render area
- Exposed-face mesh generation to avoid rendering hidden cube surfaces
- Original runtime-generated pixel textures packed into one texture atlas
- Pointer-lock first-person controls with gravity, jumping, sprinting, and voxel collision
- Grid-accurate block targeting with a visible selection outline
- Grass, dirt, stone, sand, wood, leaves, and cobblestone placement
- Sparse browser storage that saves only the seed and player edits
- Responsive pause menu, crosshair, selected-block label, and keyboard-accessible hotbar

## Requirements

- Node.js 22.12 or newer
- npm included with Node.js
- A current desktop browser with WebGL and Pointer Lock API support

No global packages are required. Dependencies are pinned in `package.json` for repeatable installation.

## Install dependencies

Open a terminal in the project root—the directory containing `package.json`—and run:

```bash
npm install
```

This installs the following pinned packages locally:

- `three@0.185.1`
- `@types/three@0.185.1`
- `typescript@7.0.2`
- `vite@8.1.4`

## Run the development build

Start Vite's local development server:

```bash
npm run dev
```

Vite prints a local address, normally `http://localhost:5173`. Open that address in a desktop browser, select
**Enter world**, and allow pointer capture if the browser asks.

To stop the development server, return to the terminal and press `Ctrl+C`.

## Create a production build

Run the strict TypeScript check followed by Vite's optimized production build:

```bash
npm run build
```

Successful output is written to `dist/`. The build command does not start a server.

## Preview the production build

After `npm run build` succeeds, serve the generated `dist/` directory through Vite's preview server:

```bash
npm run preview
```

Open the local address printed by Vite. Use `Ctrl+C` in the terminal to stop the preview server.

Do not open `dist/index.html` directly with a `file://` URL. ES modules and browser security rules require the files
to be served over HTTP, which `npm run preview` handles locally.

## Publish with GitHub Pages

The repository includes `.github/workflows/deploy-pages.yml`. It installs the exact packages in `package-lock.json`,
runs the strict production build, uploads only `dist/`, and deploys that artifact through GitHub Pages. The workflow
runs automatically after every push to `main` and can also be started manually from the **Actions** tab.

### One-time repository setup

1. Push this project to a GitHub repository with `main` as its deployment branch.
2. Open the repository on GitHub.
3. Select **Settings**, then **Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Push to `main`, or open **Actions**, select **Deploy Voxel Frontier to GitHub Pages**, and choose
   **Run workflow**.

The workflow's deployment job displays the live URL after GitHub Pages finishes publishing. Project repositories
normally use `https://USERNAME.github.io/REPOSITORY/`, while a repository named `USERNAME.github.io` is served from
`https://USERNAME.github.io/`.

### Deployment commands

Codex does not run Git commands. After reviewing the deployment files, run these commands manually:

```bash
git add vite.config.ts .github/workflows/deploy-pages.yml README.md
git add .claude/progress-history-github-pages.md .claude/learned-history-github-pages.md
git commit -m "Add GitHub Pages deployment"
git push origin main
```

The build uses relative asset URLs configured in `vite.config.ts`, so the same output works at either Pages URL form
without hard-coding a username or repository name.

### Deployment security

The workflow grants read-only repository-content access plus the two permissions GitHub Pages requires for OIDC
deployment: `pages: write` and `id-token: write`. Official GitHub actions are pinned to full commit hashes instead of
mutable tags, checkout credentials are not persisted, and no custom token, repository secret, or paid service is
required.

### Updating the deployed game

Commit and push later changes to `main`. GitHub Actions replaces the prior Pages artifact only after the new locked
install and production build succeed. If a newer push arrives while an older deployment is still running, the older
run is canceled so it cannot overwrite the newer site.

### GitHub Pages troubleshooting

- If the workflow does not start, confirm the pushed branch is named `main` and Actions are enabled for the repository.
- If deployment reports that Pages is disabled, repeat the one-time setup and select **GitHub Actions** as the source.
- If `npm ci` reports a manifest mismatch, update `package-lock.json` locally through the normal reviewed dependency
  workflow, then commit both package files together.
- If the page loads without styling or scripts, confirm `vite.config.ts` is present in the deployed commit and still
  sets `base` to `"./"`.
- If a deployment is waiting, inspect the `github-pages` environment for approval or branch-protection requirements.

## Controls

| Action | Control |
| --- | --- |
| Look | Mouse |
| Move | `W`, `A`, `S`, `D` |
| Jump | `Space` |
| Sprint | Left or right `Shift` |
| Break selected block | Left mouse button |
| Place selected material | Right mouse button |
| Select hotbar slot | Number keys `1` through `7` |
| Cycle hotbar | Mouse wheel |
| Pause or release cursor | `Esc` |

Block placement is rejected when the new block would intersect the player's body. Blocks can be edited up to six
cells from the camera.

## Saved worlds

The game saves automatically under the browser-local key `voxel-frontier.world.v1`. Only the numeric world seed and
cells changed by the player are stored; untouched terrain is regenerated from the seed whenever a chunk loads.

Browser storage belongs to the current origin. Development and preview addresses with different hostnames or ports
may therefore have separate saved worlds. Clearing site data deletes the saved world. Private browsing modes may
disable persistence; the game continues in memory and displays a warning when saving is unavailable.

## Project structure

```text
.
├── .github/workflows/
│   └── deploy-pages.yml  Locked build and GitHub Pages deployment workflow
├── vite.config.ts        Location-independent production asset configuration
└── src/
    ├── game/             Orchestration, configuration, blocks, and procedural textures
    ├── interaction/      Voxel targeting, selection highlighting, breaking, and placement
    ├── player/           Browser input, first-person movement, and collision resolution
    ├── storage/          Validated sparse local-storage persistence
    ├── ui/               DOM hotbar and pause-state presentation
    ├── world/            Noise, generation, chunks, meshing, streaming, and block edits
    ├── main.ts           Browser entry point and safe startup error boundary
    └── styles.css        Full-screen game and interface styling
```

The render loop in `src/game/game.ts` updates chunk availability before player physics, processes selection and world
edits, then renders the current scene. The `World` class is the shared block-query boundary used by collision,
interaction, generation, persistence, and mesh construction.

## Troubleshooting

### `npm install` reports an unsupported Node.js version

Install Node.js 22.12 or newer, reopen the terminal, verify with `node --version`, and run `npm install` again.

### The page displays “Unable to start”

Confirm hardware acceleration and WebGL are enabled in the browser. Update the browser and graphics driver, then
reload the page. The browser developer console contains a concise initialization diagnostic without local paths.

### Clicking “Enter world” does not capture the mouse

Pointer lock requires a direct user gesture and can be blocked by browser or embedded-frame policy. Open the game in
its own tab, click **Enter world** again, and confirm the site is allowed to capture the pointer.

### World changes do not survive a reload

Allow site storage, leave private browsing, and make sure the same hostname and port are used after reload. A warning
beside the hotbar indicates that the browser rejected the most recent save.

### Performance is low

Close GPU-heavy tabs, enable hardware acceleration, and reduce browser zoom or display resolution. The renderer caps
device pixel density and the source keeps a bounded five-by-five chunk area loaded.

## Current scope

Voxel Frontier is a complete creative sandbox release, not a byte-for-byte recreation of Minecraft. Crafting,
survival health, mobs, water simulation, multiplayer, accounts, and copied proprietary content are intentionally
outside this release.

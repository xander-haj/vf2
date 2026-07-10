# Voxel Frontier

Voxel Frontier is an original single-player creative voxel sandbox for modern desktop and mobile browsers. It
provides seeded biome terrain, chunk streaming, first-person movement, block collision, breaking and placement, a
seven-slot hotbar, and automatic local world persistence. Its procedural artwork and source code do not use
Minecraft or Mojang assets.

## Features

- Versioned 128-block engine-v2 worlds with climate biomes, density terrain, caves, aquifers, and structures
- Five editable ore shapes, cross-chunk decorations, per-feature salts, and deterministic pass explanations
- Chunked worlds split into independently meshed 16-block-high vertical sections
- Exposed-face mesh generation that remeshes only sections affected by block edits
- Original runtime-generated pixel textures packed into one texture atlas
- Pointer-lock first-person controls with gravity, jumping, sprinting, and voxel collision
- Multi-touch movement, camera, breaking, placement, jumping, sprinting, and persistent joystick settings
- Grid-accurate block targeting with a visible selection outline
- Grass, dirt, stone, sand, wood, leaves, and cobblestone placement
- NPC, hostile, and passive actors with factions, behavior graphs, navigation, combat, loot, dialogue, and trades
- Versioned storage for generation identity, edits, persistent actors, and collected entity loot
- A local GUI engine editor with production previews, undo/redo, validation, and atomic code generation
- Opaque and translucent mesh passes for generated Water and Lava blocks

## Requirements

- Node.js 22.12 or newer
- npm included with Node.js
- A current browser with WebGL and either Pointer Lock or Pointer Events support

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

Vite prints a local address, normally `http://localhost:5173`. Open that address in a browser, select **Enter world**,
and allow pointer capture if the desktop browser asks.

To test on a phone connected to the same trusted local network, expose the development server deliberately:

```bash
npm run dev -- --host 0.0.0.0
```

Open the network address printed by Vite on the phone. Stop the server when testing is complete so it is not left
available to other devices on the network.

To stop the development server, return to the terminal and press `Ctrl+C`.

## Run the local engine editor

Start the authenticated loopback-only editor:

```bash
npm run editor
```

The editor loads canonical files under `content/` and previews unsaved changes through the production world,
meshing, entity, animation, behavior, and combat systems. Saving validates the complete snapshot and atomically
regenerates allowlisted files under `src/generated/`. The bridge exists only in explicit editor mode and is excluded
from the production game.

Select **Guide** immediately to the left of the **Build** workspace for the complete editing, preview, world
generation, entity testing, behavior graph, validation, saving, and keyboard-control workflow. Hover or focus editor
controls for context-specific usage tooltips.

The editor library is organized into **Visual objects** and **Rules & data**. A cube icon guarantees a graphical
preview; page and logic icons intentionally open settings without fabricating a 3D object. Procedural creature models
use a mouse-first block builder with shape and color trays, direct grid placement, piece selection, movement, layers,
rotation, copying, painting, and erasing. All canonical fields remain available in **Advanced details**.

World-object selections are focused rather than repeating the same seed chunk. Biomes render production terrain with
the selected biome forced and display its top, filler, shore, and underwater materials. Ores, decorations, and
structures render isolated production-generated shapes using their registered block textures. Frozen legacy entries
use isolated material-accurate cards. Missing block references produce an explicit preview error instead of silently
substituting another asset.

Use the standalone content checks when reviewing authored changes:

```bash
npm run content:validate
npm run test:content
```

## Create a production build

Run deterministic content generation, the strict TypeScript check, and Vite's optimized production build:

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

## Desktop controls

| Action | Control |
| --- | --- |
| Look | Mouse |
| Move | `W`, `A`, `S`, `D` |
| Jump | `Space` |
| Sprint | Left or right `Shift` |
| Attack entity / break block | Left mouse button |
| Talk to entity / place block | Right mouse button |
| Select hotbar slot | Number keys `1` through `7` |
| Cycle hotbar | Mouse wheel |
| Pause or release cursor | `Esc` |

Block placement is rejected when the new block would intersect the player or a live entity. Blocks and entities can
be targeted up to six cells from the camera.

## Mobile controls

Touch-oriented devices are detected through pointer capabilities rather than user-agent strings.

| Action | Control |
| --- | --- |
| Look | Drag the right side of the viewport |
| Optional camera stick | Enable **Camera thumbstick** in touch settings |
| Move | Left joystick |
| Jump | Hold **Jump** |
| Sprint | Hold **Sprint** while moving |
| Break selected block | Quickly tap the right-side look area |
| Place selected material | Tap **Place** |
| Select hotbar slot | Tap a hotbar block |
| Enter or exit fullscreen | Top-right corner icon |
| Adjust joystick | Settings icon above the joystick |

The settings panel changes thumbstick size, horizontal placement, vertical placement, joystick strength, and camera
strength up to 600% with a live preview. Camera strength applies to both right-side swipes and the optional right
camera thumbstick. Vertical scrolling takes priority over sliders when a gesture begins across them, and tapping the
dimmed area outside the settings card closes it. Lower vertical placement can move the joystick close to the device
safe area without clipping it. Valid settings are saved under `voxel-frontier.mobile-controls.v1`; older v1
preferences retain their saved placement and receive neutral strength and disabled camera-stick defaults. The reset
control restores the documented defaults. Fullscreen uses the browser's standard Fullscreen API and remains disabled
when that browser does not expose it.

## Saved worlds

Current worlds save automatically under `voxel-frontier.world.v3`. The payload contains generation identity, seed,
changed cells, versioned persistent entity components, death tombstones, and collected entity-loot inventory.
Untouched terrain is still regenerated deterministically whenever a chunk loads.

The original `voxel-frontier.world.v1` and generation-aware `voxel-frontier.world.v2` keys are read-only migration
sources. A valid older save is copied to v3 without overwriting or deleting its rollback entry. Version-1 worlds keep
the frozen `vf:legacy_v1` identity; newly created worlds use `vf:engine_v2`. Invalid current data blocks further
writes so it cannot be silently replaced by a fresh world.

The seed alone is not the complete generation contract. Reproducing untouched terrain also requires the saved world
profile, generator version, and content-registry version. This release supports frozen `vf:legacy_v1` worlds and the
data-driven `vf:engine_v2` density pipeline.

Browser storage belongs to the current origin. Development and preview addresses with different hostnames or ports
may therefore have separate saved worlds. Clearing site data deletes the saved world. Private browsing modes may
disable persistence; the game continues in memory and displays a warning when saving is unavailable.

## Project structure

```text
.
├── .github/workflows/
│   └── deploy-pages.yml  Locked build and GitHub Pages deployment workflow
├── content/              Canonical block, worldgen, entity, behavior, loot, dialogue, and trade data
├── editor.html           Local-only GUI engine editor entry point
├── tools/                Deterministic content compiler and authenticated loopback editor bridge
├── vite.config.ts        Location-independent production asset configuration
└── src/
    ├── editor/           GUI inspectors, production previews, and isolated runtime test scenes
    ├── engine/           World-generation and generic entity simulation systems
    ├── game/             Orchestration, configuration, blocks, and procedural textures
    ├── generated/        Typed registries generated from canonical content
    ├── interaction/      Voxel targeting, selection highlighting, breaking, and placement
    ├── player/           Browser input, first-person movement, and collision resolution
    ├── storage/          Versioned save validation, migration, and sparse persistence
    ├── ui/               DOM hotbar, pause state, mobile input, settings, and fullscreen presentation
    ├── world/            Profiles, noise, generation, sectioned chunks, meshing, streaming, and edits
    ├── main.ts           Browser entry point and safe startup error boundary
    ├── styles.css        Desktop game and interface styling
    ├── mobile-controls.css  Touch settings, overlay, and fullscreen styling
    └── mobile-gamepad.css  Movement stick, camera stick, and action-button layout
```

The render loop in `src/game/game.ts` updates chunk availability, player physics, bounded entity AI, combat,
interaction, HUD state, and rendering in dependency order. `World` is the shared block-query boundary used by
collision, spawning, perception, generation, persistence, and mesh construction.

## Troubleshooting

### `npm install` reports an unsupported Node.js version

Install Node.js 22.12 or newer, reopen the terminal, verify with `node --version`, and run `npm install` again.

### The page displays “Unable to start”

Confirm hardware acceleration and WebGL are enabled in the browser. Update the browser and graphics driver, then
reload the page. The browser developer console contains a concise initialization diagnostic without local paths.

### Clicking “Enter world” does not capture the mouse

Pointer lock requires a direct user gesture and can be blocked by browser or embedded-frame policy. Open the game in
its own tab, click **Enter world** again, and confirm the site is allowed to capture the pointer.

### Mobile controls do not respond

Open the game directly rather than inside an embedded preview, tap **Enter world**, and make sure browser zoom or
page gestures are not being forced by an accessibility extension. Reload after rotating if the browser has retained
an outdated viewport. The joystick and action controls support independent simultaneous fingers.

### Fullscreen is disabled on mobile

The browser does not expose standard page fullscreen for this device or context. The game remains fully playable in
the browser viewport; fullscreen cannot be forced when the browser disables that capability.

### World changes do not survive a reload

Allow site storage, leave private browsing, and make sure the same hostname and port are used after reload. A warning
beside the hotbar indicates that the browser rejected the most recent save.

### Performance is low

Close GPU-heavy tabs, enable hardware acceleration, and reduce browser zoom or display resolution. The renderer caps
device pixel density, vertical sections bound remeshing work, and entity AI sleeps outside its active radius.

## Current scope

Voxel Frontier is an original voxel engine and creative sandbox, not a byte-for-byte recreation of Minecraft.
Crafting, equipment, survival hunger, dynamic fluid flow, block lighting, particles, audio, additional dimensions,
multiplayer, accounts, and copied proprietary content remain separate Phase-G-or-later systems.

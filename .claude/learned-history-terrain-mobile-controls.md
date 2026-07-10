# Learned History — Terrain Mobile Controls

## Approved Feature Boundary

- Expanded terrain covers Overworld surface materials, underground geology, bedrock, and normal/deepslate ores.
- Existing terrain heights, deterministic seeds, tree generation, sparse player edits, and the seven-slot hotbar remain.
- Trees receive no new species or behavior, and water, lava, structures, vegetation, Nether, and End terrain are excluded.
- Mobile mapping is left joystick movement, right-side drag look, right-side tap break, and explicit place, jump, and
  sprint buttons.
- Touch-capable devices receive a top-right fullscreen control and settings for persisted joystick size and placement.

## Implementation Constraints

- Desktop mouse actions remain pointer-lock-only so compatibility mouse events from touch UI cannot edit the world.
- Mobile controls use Pointer Events, pointer capture, and `touch-action: none` to support simultaneous controls.
- Mobile gameplay has an explicit active state because pointer lock is not the mobile simulation gate.
- Fullscreen requests occur directly from a button activation and expose unsupported or rejected states safely.
- Block IDs remain byte-sized and append-only so existing sparse edit values continue to validate.
- Vite's relative `base: "./"` and the existing GitHub Pages workflow remain unchanged.

## Implemented Terrain Pipeline

- `block-model.ts` owns stable IDs and texture-name types; `block-definitions.ts` owns behavior and face metadata.
- `block-texture-recipes.ts` supplies a complete procedural recipe record, while `texture-atlas.ts` packs it into a
  dynamic square power-of-two atlas.
- `terrain-biomes.ts` chooses broad climate regions and shallow visible strata without changing terrain elevation.
- `terrain-geology.ts` supplies bedrock, stone families, mineral pockets, and normal/deepslate ore variants.
- Existing seeds and sparse edits remain on schema version 1; untouched coordinates adopt the expanded generation.

## Implemented Mobile Pipeline

- `InputController` remains the only frame-facing input boundary and combines keyboard/mouse with `MobileControls`.
- `MobileControls` owns gameplay Pointer Events; `MobileControlsSettings` owns fullscreen and preference UI events.
- Mobile activation substitutes for pointer lock in `Game`, while desktop mouse events still require actual pointer lock.
- Joystick placement is stored as bounded viewport ratios, with CSS safe-area and hotbar clearance applied afterward.
- The mobile look surface stops above the hotbar so block-selection taps cannot become world-breaking taps.

## Mobile Response and Geometry

- Joystick strength scales the circular movement magnitude rather than each axis, preserving diagonal direction.
- Camera swipe strength scales only touch deltas; the shared look sensitivity and desktop mouse response remain intact.
- The v1 preference key accepts its original three-field shape and supplies neutral defaults only for missing strength
  fields, while explicit invalid values still reject the snapshot.
- Vertical placement can reach the device safe area because CSS clamps the joystick center by its radius plus 12px,
  rather than reserving the unrelated 78px hotbar height beneath the entire control.
- Mobile action controls use explicit equal width and height constraints so labels and grid spans cannot create ovals.

## Camera Thumbstick and Scroll-Safe Settings

- One reusable `MobileThumbstick` owns normalized circular pointer input for both movement and camera controls.
- Camera thumbstick displacement becomes a pixels-per-second look contribution multiplied by clamped frame duration;
  swipe pixels remain unscaled by frame time.
- The persisted camera-thumbstick flag defaults to false only when absent, preserving old v1 settings without treating
  explicit invalid values as migrations.
- Native range inputs use `touch-action: pan-y` inside the scrollable settings card so vertical gestures scroll the
  modal, while deliberate horizontal gestures adjust values.
- Backdrop dismissal checks `event.target` against the full-screen settings panel, so pointer input inside the card
  never closes it.
- Camera-stick mode places actions above the stick in portrait and to its left in short landscape layouts.

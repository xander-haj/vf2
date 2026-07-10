# Bugfix History — Terrain Mobile Controls

## 2026-07-10 04:30 — BUG_FIXED

**Bug:** Mobile action-button backgrounds rendered as stretched ovals instead of clean touch circles.  
**Root cause:** The action grid used 62px-wide by 54px-high cells, ordinary actions had a 12px corner radius, and the
Jump control spanned two rows without a fixed square size.  
**Fix applied:** Assigned every action an explicit square footprint and circular radius, retained a larger square Jump
control, and changed the grid to equal-size rows and columns.  
**Files changed:** src/mobile-controls.css  
**Verification:** Static CSS inspection confirmed equal width and height constraints, `aspect-ratio: 1`, and
`border-radius: 50%` for every mobile action button.

## 2026-07-10 04:30 — BUG_FIXED

**Bug:** The vertical-placement slider could not move the joystick near the bottom of the mobile viewport.  
**Root cause:** Storage rejected ratios below 0.16 and CSS forced the joystick center to remain one radius plus the
full 78px hotbar clearance above the safe area.  
**Fix applied:** Lowered the validated ratio floor to 0.05 and replaced the hotbar-height clamp with a radius plus
12px safe-area margin, keeping the complete joystick visible while allowing substantially lower placement.  
**Files changed:** index.html, src/storage/mobile-settings-storage.ts, src/mobile-controls.css  
**Verification:** Static boundary inspection confirmed matching HTML and TypeScript minima and a CSS lower bound that
keeps the joystick edge 12px above `env(safe-area-inset-bottom)`.

## 2026-07-10 11:30 — BUG_FIXED

**Bug:** Vertical scrolling across a mobile settings slider could unintentionally change its value.  
**Root cause:** Range inputs declared `touch-action: pan-x`, preventing the settings card from claiming the user's
vertical gesture when it began over a slider.  
**Fix applied:** Changed range inputs and the modal overlay to `touch-action: pan-y` and contained card overscroll, so
vertical gestures scroll while deliberate horizontal gestures remain slider input.  
**Files changed:** src/mobile-controls.css  
**Verification:** Static touch-action inspection confirmed the scroll container and every range input allow vertical
panning, while gameplay thumbsticks retain `touch-action: none` in their isolated stylesheet.

## 2026-07-10 11:30 — BUG_FIXED

**Bug:** Tapping the dimmed area around the mobile settings card did not close the modal.  
**Root cause:** Only the explicit close button owned a dismissal listener; the full-screen settings panel had none.  
**Fix applied:** Added backdrop pointer dismissal guarded by exact event-target identity, preserving all card input and
restoring focus to the settings button after closure.  
**Files changed:** src/ui/mobile-controls-settings.ts  
**Verification:** Static event routing confirmed only direct panel-background pointers call the shared close path.

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

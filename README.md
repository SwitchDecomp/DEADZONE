# DEADZONE

First-person zombie survival built with Three.js. Everything (textures, models, audio) is generated procedurally at load time — no external assets.

```
npm install
npm run dev
```

Open the printed URL (default http://localhost:5173), click **DEPLOY**.

Controls: WASD move · Mouse look · LMB fire · RMB aim · Shift sprint · C crouch/slide · Space jump · R reload · F interact (hold to rebuild barriers) · V/E melee · G grenade · 1/2/3 or wheel switch · Tab intel · Esc pause.

## Assets

Realistic assets are stored locally in `public/` (re-download with `node scripts/fetch-assets.mjs`):

- PBR surfaces, night HDRI, photoscanned props, `service_pistol` and `bolt_action_rifle_7_62` — [Poly Haven](https://polyhaven.com) (CC0).
- `Soldier.glb`, `Michelle.glb` rigged characters + mocap clips — three.js example models (Mixamo).

If any file is missing the game falls back to its procedural textures/models.

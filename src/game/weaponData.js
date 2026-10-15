// Weapon definitions. dmg = per bullet/pellet. rpm = rounds per minute.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P-9 WARDEN', up: "WARDEN'S WRATH", sound: 'pistol', type: 'pistol', auto: false,
    dmg: 45, rpm: 420, mag: 8, reserve: 80, reload: 1.35, reloadEmpty: 1.7, pellets: 1, spread: 0.018, ads: 0.003,
    recoil: 0.024, kick: 0.05, pen: 1, headMult: 3.5, adsZoom: 1.15, adsTime: 0.14, move: 1.0, cost: 0,
    hip: [0.13, -0.135, -0.33],
  },
  smg: {
    id: 'smg', name: 'MK-5 VANDAL', up: 'VANDAL PRIME', sound: 'smg', type: 'smg', auto: true,
    dmg: 38, rpm: 820, mag: 32, reserve: 192, reload: 1.9, reloadEmpty: 2.3, pellets: 1, spread: 0.03, ads: 0.008,
    recoil: 0.012, kick: 0.025, pen: 1, headMult: 3, adsZoom: 1.25, adsTime: 0.17, move: 1.0, cost: 1000,
    hip: [0.14, -0.15, -0.34],
  },
  shotgun: {
    id: 'shotgun', name: 'BULLDOG 12', up: 'HELLHOUND 12', sound: 'shotgun', type: 'shotgun', auto: false,
    dmg: 60, rpm: 75, mag: 6, reserve: 48, reload: 0.5, reloadEmpty: 0.5, perShell: true, pellets: 9, spread: 0.075, ads: 0.055,
    recoil: 0.07, kick: 0.12, pen: 1, headMult: 2, adsZoom: 1.15, adsTime: 0.22, move: 0.95, cost: 1500,
    hip: [0.14, -0.15, -0.3],
  },
  ar: {
    id: 'ar', name: 'AR-77 STRIDER', up: 'STRIDER X-99', sound: 'ar', type: 'ar', auto: true,
    dmg: 70, rpm: 620, mag: 30, reserve: 240, reload: 2.1, reloadEmpty: 2.6, pellets: 1, spread: 0.028, ads: 0.004,
    recoil: 0.016, kick: 0.035, pen: 2, headMult: 3, adsZoom: 1.4, adsTime: 0.22, move: 0.93, cost: 1400,
    hip: [0.14, -0.15, -0.3],
  },
  burst: {
    id: 'burst', name: 'TEMPEST M3', up: 'TEMPEST FURY', sound: 'burst', type: 'burst', auto: false, burst: 3,
    dmg: 85, rpm: 900, burstDelay: 0.32, mag: 24, reserve: 192, reload: 2.0, reloadEmpty: 2.4, pellets: 1, spread: 0.024, ads: 0.003,
    recoil: 0.014, kick: 0.03, pen: 2, headMult: 3.2, adsZoom: 1.6, adsTime: 0.22, move: 0.93, cost: 1200,
    hip: [0.14, -0.15, -0.28],
  },
  lmg: {
    id: 'lmg', name: 'HX GRINDER', up: 'GRINDER OVERLORD', sound: 'lmg', type: 'lmg', auto: true,
    dmg: 90, rpm: 700, mag: 100, reserve: 400, reload: 3.6, reloadEmpty: 4.0, pellets: 1, spread: 0.04, ads: 0.008,
    recoil: 0.018, kick: 0.04, pen: 3, headMult: 2.5, adsZoom: 1.35, adsTime: 0.32, move: 0.85, cost: 0,
    hip: [0.15, -0.17, -0.3],
  },
  sniper: {
    id: 'sniper', name: 'KESTREL .50', up: 'KESTREL REQUIEM', sound: 'sniper', type: 'sniper', auto: false,
    dmg: 900, rpm: 48, mag: 5, reserve: 40, reload: 3.0, reloadEmpty: 3.4, pellets: 1, spread: 0.08, ads: 0.0,
    recoil: 0.09, kick: 0.15, pen: 8, headMult: 4, adsZoom: 4, adsTime: 0.3, move: 0.88, cost: 0, scope: true, bolt: true,
    hip: [0.15, -0.16, -0.28],
  },
  volt: {
    id: 'volt', name: 'VOLT THROWER', up: 'VOLT TEMPEST OMEGA', sound: 'volt', type: 'volt', auto: false,
    dmg: 2500, rpm: 100, mag: 6, reserve: 30, reload: 2.6, reloadEmpty: 2.6, pellets: 1, spread: 0.0, ads: 0.0,
    recoil: 0.05, kick: 0.09, pen: 1, chains: 6, headMult: 1, adsZoom: 1.2, adsTime: 0.2, move: 0.95, cost: 0,
    hip: [0.14, -0.15, -0.32], wonder: true,
  },
};

export const BOX_POOL = ['smg', 'shotgun', 'ar', 'burst', 'lmg', 'sniper', 'volt', 'volt', 'lmg', 'sniper', 'shotgun', 'ar'];

export function upgradeDef(def) {
  const u = { ...def };
  u.upgraded = true;
  u.name = def.up;
  u.dmg = Math.round(def.dmg * (def.wonder ? 2 : 2.4));
  u.mag = Math.round(def.mag * (def.perShell ? 1.34 : def.wonder ? 2 : 1.5));
  u.reserve = Math.round(def.reserve * 1.8);
  u.rpm = def.rpm * 1.12;
  u.spread = def.spread * 0.8;
  u.pen = def.pen + 1;
  if (def.id === 'pistol') { u.explosive = true; u.mag = 12; u.reserve = 120; u.dmg = 140; }
  if (def.id === 'shotgun') u.pellets = 12;
  if (def.id === 'volt') u.chains = 12;
  if (def.id === 'sniper') u.explosive = true;
  return u;
}

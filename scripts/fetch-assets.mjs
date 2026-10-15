// Downloads CC0 assets from Poly Haven into public/. Run: node scripts/fetch-assets.mjs [group]
import fs from 'node:fs';
import path from 'node:path';
const OUT = path.resolve('public');
const TEXTURES = {
  concrete: 'concrete_wall_008', brick: 'brick_wall_02', asphalt: 'asphalt_02', tiles: 'dirty_tiles', wood: 'wood_planks',
  woodOld: 'weathered_planks', rust: 'rusty_metal_02', corrugated: 'rusty_corrugated_iron', plaster: 'worn_plaster_wall',
  dirt: 'brown_mud_leaves_01', floor: 'concrete_floor_worn_001', metal: 'metal_plate', painted: 'rusty_painted_metal',
};
const MODELS = [
  'Barrel_01', 'barrel_03', 'concrete_road_barrier', 'metal_jerrycan', 'old_military_crate', 'wooden_crate_01', 'wooden_crate_02',
  'old_tyre', 'metal_tool_chest', 'metal_trash_can', 'portable_generator', 'power_box_01', 'trashbag', 'wheelchair_01', 'medical_box',
  'cardboard_box_01', 'tool_cart', 'ammo_box', 'utility_box_01', 'hanging_industrial_lamp', 'service_pistol', 'bolt_action_rifle_7_62',
];
const HDRI = 'moonlit_golf';
const api = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`)).json();
async function dl(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}
async function textures() {
  await Promise.all(Object.entries(TEXTURES).map(async ([key, id]) => {
    const j = await api(id);
    const pickMap = (k) => j[k] && j[k]['1k'] && (j[k]['1k'].jpg || j[k]['1k'].png);
    const maps = { diff: pickMap('Diffuse'), nor: pickMap('nor_gl'), arm: pickMap('arm'), rough: pickMap('Rough') };
    for (const [m, info] of Object.entries(maps)) if (info) await dl(info.url, path.join(OUT, 'tex', key, `${m}.jpg`));
    console.log('tex', key, Object.keys(maps).filter((m) => maps[m]).join(','));
  }));
}
async function models(list) {
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map(async (id) => {
      const j = await api(id);
      const g = j.gltf && j.gltf['1k'] && j.gltf['1k'].gltf;
      if (!g) { console.log('no gltf', id); return; }
      const dir = path.join(OUT, 'models', id);
      await dl(g.url, path.join(dir, `${id}.gltf`));
      for (const [rel, inc] of Object.entries(g.include || {})) await dl(inc.url, path.join(dir, rel));
      console.log('model', id);
    }));
  }
}
async function hdri() {
  const j = await api(HDRI);
  await dl(j.hdri['1k'].hdr.url, path.join(OUT, 'hdr', 'night.hdr'));
  console.log('hdri', HDRI);
}
const group = process.argv[2] || 'all';
if (group === 'tex' || group === 'all') await textures();
if (group === 'hdri' || group === 'all') await hdri();
if (group === 'models1' || group === 'all') await models(MODELS.slice(0, 11));
if (group === 'models2' || group === 'all') await models(MODELS.slice(11));

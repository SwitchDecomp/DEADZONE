import * as THREE from 'three';

export function createMaterials(T, P = {}) {
  const M = { tile: {} };
  // photographic PBR set (diffuse / normal / AO-rough-metal) when available
  const pbr = (key, set, opts = {}) => {
    const s = P[set];
    if (!s) return false;
    const m = new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normalMap, aoMap: s.arm, roughnessMap: s.arm, roughness: opts.roughness ?? 1, metalness: s.metal ? (opts.metalness ?? 1) : 0, color: opts.color ?? 0xffffff, aoMapIntensity: 1 });
    if (s.metal) m.metalnessMap = s.arm;
    m.normalScale.set(opts.normal ?? 1, opts.normal ?? 1);
    if (opts.envMapIntensity !== undefined) m.envMapIntensity = opts.envMapIntensity;
    M[key] = m; M.tile[key] = opts.tile ?? s.tile;
    return true;
  };
  const std = (key, tex, tile, opts = {}) => {
    const m = new THREE.MeshStandardMaterial({
      map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap,
      roughness: opts.roughness ?? 1, metalness: opts.metalness ?? 0,
      color: opts.color ?? 0xffffff,
    });
    if (opts.metalMap) m.metalnessMap = tex.roughnessMap;
    m.normalScale.set(opts.normal ?? 1, opts.normal ?? 1);
    if (opts.envMapIntensity !== undefined) m.envMapIntensity = opts.envMapIntensity;
    M[key] = m; M.tile[key] = tile;
    return m;
  };
  pbr('concrete', 'concrete') || std('concrete', T.concrete, 3.5);
  pbr('concreteDark', 'concrete', { color: 0x8a8682 }) || std('concreteDark', T.concrete, 3.5, { color: 0x6c6a66 });
  pbr('brick', 'brick', { normal: 1.2 }) || std('brick', T.brick, 2.4, { normal: 1.4 });
  pbr('asphalt', 'asphalt', { envMapIntensity: 1.6, color: 0xb8b8b8 }) || std('asphalt', T.asphalt, 7, { normal: 0.8, envMapIntensity: 1.4 });
  pbr('tiles', 'tiles', { envMapIntensity: 1.3 }) || std('tiles', T.tiles, 2.4, { envMapIntensity: 1.2 });
  pbr('wood', 'wood') || std('wood', T.wood, 1.6);
  pbr('woodOld', 'woodOld', { tile: 1.2 }) || std('woodOld', T.woodOld, 1.2);
  pbr('rust', 'rust') || std('rust', T.rustMetal, 2.2, { metalness: 1, metalMap: true });
  pbr('rustRed', 'painted', { color: 0xd09080 }) || std('rustRed', T.rustMetal, 2.2, { metalness: 1, metalMap: true, color: 0xc07060 });
  pbr('rustBlue', 'painted', { color: 0x8098b8 }) || std('rustBlue', T.rustMetal, 2.2, { metalness: 1, metalMap: true, color: 0x7088a8 });
  pbr('corrugated', 'corrugated') || std('corrugated', T.corrugated, 1.8, { metalness: 1, metalMap: true });
  pbr('plaster', 'plaster') || std('plaster', T.plaster, 3);
  pbr('plasterBlue', 'plaster', { color: 0xa8c0c4 }) || std('plasterBlue', T.plaster, 3, { color: 0x9fb4b8 });
  std('hazard', T.hazard, 1.2, { metalness: 1, metalMap: true });
  pbr('dirt', 'dirt') || std('dirt', T.dirt, 4);
  pbr('floor', 'floor') || std('floor', T.concrete, 3.5);
  pbr('floorDark', 'floor', { color: 0x8a8884 }) || std('floorDark', T.concrete, 3.5, { color: 0x6c6a66 });
  pbr('steelPlate', 'metal', { color: 0x9a9a9a }) || std('steelPlate', T.rustMetal, 2.2, { metalness: 1, metalMap: true });
  std('camo', T.camo, 1.5);
  std('canvas', T.camo, 3, { color: 0x8a9070 });

  const plain = (key, color, rough, metal = 0, extra = {}) => {
    M[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
    M.tile[key] = 1;
  };
  plain('black', 0x0a0a0a, 0.8);
  plain('rubber', 0x111111, 0.92);
  plain('steel', 0x8a8d90, 0.35, 1);
  plain('darkSteel', 0x2a2c2e, 0.45, 1);
  plain('chrome', 0xcccccc, 0.15, 1);
  plain('glass', 0x101820, 0.05, 0.4, { transparent: true, opacity: 0.55 });
  plain('mattress', 0x6a7068, 0.95);
  plain('sandbag', 0x6e6248, 1);
  M.sandbag.map = T.camo.map; M.sandbag.normalMap = T.camo.normalMap; M.sandbag.color.set(0xa89878);
  plain('bark', 0x2a2420, 1);
  M.bark.map = T.woodOld.map; M.bark.normalMap = T.woodOld.normalMap; M.bark.color.set(0x5a5048);
  plain('white', 0xd8d8d0, 0.6);
  plain('policeBlack', 0x0b0c10, 0.3, 0.6);
  plain('policeWhite', 0xd0d0d0, 0.35, 0.6);
  if (!pbr('olive', 'painted', { color: 0x7a8a5a })) {
    plain('olive', 0x3c4430, 0.6, 0.3);
    M.olive.map = T.rustMetal.map; M.olive.normalMap = T.rustMetal.normalMap; M.olive.roughnessMap = T.rustMetal.roughnessMap; M.tile.olive = 2;
  }
  plain('silhouette', 0x050608, 1);
  plain('wire', 0x3a3a3a, 0.5, 0.8);

  const emis = (key, color, intensity) => {
    M[key] = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
    M.tile[key] = 1;
  };
  emis('lampWarm', 0xffb060, 6);
  emis('lampCool', 0xd8ecff, 5);
  emis('lampRed', 0xff2010, 4);
  emis('lampGreen', 0x20ff40, 4);
  emis('windowLit', 0xffa850, 1.6);
  emis('windowLitCool', 0x8ab0ff, 1.0);
  emis('headlight', 0xfff2d0, 8);
  emis('gauge', 0x60ff90, 2);
  emis('fireGlow', 0xff6020, 5);
  emis('blink', 0xff0000, 8);

  // additive glow / cone material
  M.cone = (color, opacity = 0.12) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; uniform float uTime;
      void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float f = abs(dot(vN, vV)); float a = pow(vY, 1.6) * f * f * uOpacity; gl_FragColor = vec4(uColor * a, 1.0); }`,
  });
  return M;
}

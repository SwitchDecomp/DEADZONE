import * as THREE from 'three';

export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uRed: { value: 0 },
      uMoon: { value: new THREE.Vector3(0.45, 0.55, -0.7).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uFlash, uRed; uniform vec3 uMoon; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.2, 1.0);
        vec3 horizon = mix(vec3(0.028,0.034,0.045), vec3(0.06,0.012,0.01), uRed);
        vec3 zenith = mix(vec3(0.004,0.006,0.012), vec3(0.012,0.002,0.002), uRed);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.6, h));
        // clouds
        vec2 uv = d.xz / max(0.08, d.y + 0.15) * 1.3;
        float c = fbm(uv + vec2(uTime*0.012, uTime*0.004));
        float c2 = fbm(uv*2.2 - vec2(uTime*0.02, 0.0));
        float cl = smoothstep(0.42, 0.85, c*0.7 + c2*0.4);
        float md = max(dot(d, uMoon), 0.0);
        vec3 moonCol = mix(vec3(0.6,0.7,0.85), vec3(0.9,0.3,0.2), uRed);
        // moon disc + halo
        float disc = smoothstep(0.9993, 0.9996, md);
        float halo = pow(md, 120.0)*0.25 + pow(md, 12.0)*0.06;
        col += moonCol * halo;
        col += moonCol * disc * 2.2 * (1.0 - cl*0.85);
        vec3 cloudCol = mix(vec3(0.02,0.025,0.032), vec3(0.05,0.012,0.01), uRed) + moonCol*pow(md,8.0)*0.12;
        col = mix(col, cloudCol, cl * smoothstep(-0.05, 0.2, d.y));
        // stars
        float st = step(0.9985, hash(floor(d.xz*400.0 + d.y*200.0))) * (1.0-cl) * smoothstep(0.1, 0.5, d.y);
        col += vec3(st*0.5);
        // lightning
        col += vec3(0.5,0.55,0.7) * uFlash * (0.3 + cl*1.6) * smoothstep(-0.1, 0.4, d.y);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

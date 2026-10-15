import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

class ViewmodelPass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.needsSwap = false;
    this.enabled = true;
  }
  render(renderer, writeBuffer, readBuffer) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}

const FXShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uDamage: { value: 0 },
    uLow: { value: 0 },
    uAberr: { value: 1 },
    uGrain: { value: 0.045 },
    uRed: { value: 0 },
    uFlash: { value: 0 },
    uDesat: { value: 0 },
    uBlur: { value: 0 },
    uRes: { value: new THREE.Vector2(1920, 1080) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uDamage, uLow, uAberr, uGrain, uRed, uFlash, uDesat, uBlur; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = length(c);
      float ab = uAberr * (0.0015 + d*d*0.012) + uDamage*0.008;
      vec3 col;
      if (uBlur > 0.001) {
        vec3 acc = vec3(0.0); float tot = 0.0;
        for (int i=0;i<8;i++){ float a = float(i)*0.785; vec2 o = vec2(cos(a),sin(a))*uBlur*0.006*d; acc += texture2D(tDiffuse, uv+o).rgb; tot += 1.0; }
        col = acc/tot;
      } else {
        col.r = texture2D(tDiffuse, uv - c*ab).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv + c*ab).b;
      }
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      // grade: cool shadows, warm highlights
      col += vec3(-0.012, 0.0, 0.02) * (1.0 - smoothstep(0.0, 0.4, l));
      col *= mix(vec3(1.0), vec3(1.05, 1.0, 0.94), smoothstep(0.35, 0.9, l));
      col = mix(col, col*col*(3.0-2.0*col), 0.18);
      col = mix(col, vec3(l), uDesat);
      // red fog
      col = mix(col, vec3(l*1.25, l*0.45, l*0.4), uRed*0.35);
      // vignette
      float vig = smoothstep(0.95, 0.3, d);
      col *= mix(0.55, 1.0, vig);
      // damage
      float edge = smoothstep(0.2, 0.8, d);
      col = mix(col, vec3(0.3,0.0,0.0), edge*uDamage*0.8);
      col = mix(col, col*vec3(1.0,0.25,0.25), uLow*(0.55+0.45*sin(uTime*6.0))*edge);
      // grain
      float g = hash(uv*uRes + fract(uTime*13.1)*vec2(91.7, 37.3)) - 0.5;
      col += g * uGrain * (1.2 - l);
      // scanline subtle
      col += uFlash;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, vmScene, vmCamera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, this.rt);
    this.renderPass = new RenderPass(scene, camera);
    this.vmPass = new ViewmodelPass(vmScene, vmCamera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.55, 0.82);
    this.output = new OutputPass();
    this.fx = new ShaderPass(FXShader);
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.vmPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.fxaa);
    this.composer.addPass(this.fx);
    this.u = this.fx.uniforms;
  }
  setQuality(q) {
    const samples = q === 'high' || q === 'ultra' ? 4 : 0;
    this.fxaa.enabled = !samples;
    this.composer.renderTarget1.samples = samples;
    this.composer.renderTarget2.samples = samples;
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.enabled = q !== 'low';
  }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.u.uRes.value.set(w * pr, h * pr);
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  render(dt) {
    this.u.uTime.value += dt;
    this.composer.render(dt);
  }
}

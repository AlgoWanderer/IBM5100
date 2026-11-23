import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import * as THREE from "three";

// One pass that turns the rendered scene into a picture on a curved CRT:
// barrel distortion, RGB fringing, scanlines, aperture grille, vignette,
// noise, flicker — plus a tearing glitch the easter eggs can trigger.
const fragment = /* glsl */ `
uniform float uTime;
uniform float uCurve;
uniform float uGlitch;
uniform float uNoise;
uniform vec2 uRes;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// postprocessing forbids UV-transform hooks in effects that sample neighbours,
// so the barrel distortion is done here by sampling inputBuffer at a bent uv.
vec2 crtUv(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  vec2 off = abs(c.yx) / uCurve;
  c += c * off * off;
  uv = c * 0.5 + 0.5;
  if (uGlitch > 0.001) {
    float band = floor(uv.y * 24.0 + uTime * 17.0);
    float on = step(1.0 - uGlitch * 0.35, hash(vec2(band, floor(uTime * 24.0))));
    uv.x += on * (hash(vec2(band, uTime)) - 0.5) * 0.12 * uGlitch;
    uv.y += sin(uTime * 3.0) * 0.004 * uGlitch;
  }
  return uv;
}

// cheap phosphor glow: only bright pixels (the little CRT's text) bleed light
vec3 glow(vec2 uv) {
  vec3 acc = vec3(0.0);
  vec2 px = 1.0 / uRes;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988;
    vec2 dir = vec2(cos(a), sin(a));
    vec3 s1 = texture2D(inputBuffer, uv + dir * px * 3.0).rgb;
    vec3 s2 = texture2D(inputBuffer, uv + dir * px * 7.0).rgb;
    acc += max(s1 - 1.05, 0.0) * 0.6 + max(s2 - 1.05, 0.0) * 0.4;
  }
  return acc / 12.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uvIn, out vec4 outputColor) {
  vec2 uv = crtUv(uvIn);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    outputColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float ca = 0.0011 + uGlitch * 0.008;
  vec3 col;
  col.r = texture2D(inputBuffer, uv + vec2(ca, 0.0)).r;
  col.g = texture2D(inputBuffer, uv).g;
  col.b = texture2D(inputBuffer, uv - vec2(ca, 0.0)).b;
  col += glow(uv) * vec3(0.75, 1.0, 0.8) * 1.2;

  // scanlines: one dark line every ~3 output pixels
  float lines = uRes.y / 3.0;
  float s = 0.5 + 0.5 * sin(uv.y * lines * 6.2831853);
  col *= mix(0.74, 1.0, s);

  // aperture grille (faint RGB stripes)
  float m = mod(gl_FragCoord.x, 3.0);
  col *= vec3(m < 1.0 ? 1.06 : 0.96, (m >= 1.0 && m < 2.0) ? 1.06 : 0.96, m >= 2.0 ? 1.06 : 0.96);

  // slow rolling brighter band
  float roll = smoothstep(0.0, 0.12, abs(fract(uv.y * 0.6 - uTime * 0.07) - 0.5));
  col *= 0.97 + 0.03 * (1.0 - roll);

  // vignette toward the curved edges
  vec2 d = uv - 0.5;
  float vig = smoothstep(0.82, 0.28, length(d * vec2(1.0, 1.1)));
  col *= mix(0.28, 1.0, vig);

  // noise + mains flicker
  float n = hash(uv * uRes + fract(uTime * 7.31) * 100.0);
  col += (n - 0.5) * uNoise;
  col *= 0.985 + 0.015 * sin(uTime * 120.0);

  outputColor = vec4(col, inputColor.a);
}
`;

const BASE_NOISE = 0.045;

class CrtEffectImpl extends Effect {
  constructor() {
    super("CrtEffect", fragment, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ["uTime", new THREE.Uniform(0)],
        ["uCurve", new THREE.Uniform(5.2)],
        ["uGlitch", new THREE.Uniform(0)],
        ["uNoise", new THREE.Uniform(BASE_NOISE)],
        ["uRes", new THREE.Uniform(new THREE.Vector2(1280, 960))],
      ]),
    });
  }

  setSize(width: number, height: number) {
    (this.uniforms.get("uRes")!.value as THREE.Vector2).set(width, height);
  }
}

/** Mutable effect levels, poked by easter eggs and decayed every frame. */
export interface FxState {
  glitch: number;
  noise: number;
}

export function CrtEffect({ fx }: { fx: FxState }) {
  const effect = useMemo(() => new CrtEffectImpl(), []);
  useEffect(() => () => effect.dispose(), [effect]);
  useFrame((_, dt) => {
    fx.glitch = Math.max(0, fx.glitch - dt * 0.9);
    fx.noise = Math.max(0, fx.noise - dt * 0.6);
    effect.uniforms.get("uTime")!.value += dt;
    effect.uniforms.get("uGlitch")!.value = Math.min(1, fx.glitch);
    effect.uniforms.get("uNoise")!.value = BASE_NOISE + Math.min(0.5, fx.noise);
  });
  return <primitive object={effect} dispose={null} />;
}

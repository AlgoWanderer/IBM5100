import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, OrbitControls, useGLTF } from "@react-three/drei";
import { EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Machine } from "../terminal/Machine";
import { CrtEffect, type FxState } from "./CrtEffect";
import type { KeyBus } from "./KeyBus";
import type { KeySlot } from "./keyMap";
import { type PreparedModel, prepareModel } from "./prepareModel";
import { type DisplayMode, ScreenRenderer } from "./ScreenTexture";

const MODEL_URL = "/models/ibm5100.web.glb";
useGLTF.preload(MODEL_URL, false, true);

/** The GLB is ~13 cm wide in its own units; scale it up to a comfortable size. */
const SCALE = 10;
const PRESS_DEPTH = 0.0022; // GLB units (≈ a third of a key's height)

/** Add ?nofx to the URL to switch the CRT shader off (debugging / slow GPUs). */
const NO_FX = new URLSearchParams(window.location.search).has("nofx");

/** Camera shots: the fixed home angle, and a close-up of the 5100's own screen. */
export type Shot = "home" | "screen";
const SHOTS: Record<Shot, { pos: THREE.Vector3; target: THREE.Vector3 }> = {
  home: { pos: new THREE.Vector3(-0.06, 1.42, 1.95), target: new THREE.Vector3(-0.06, 0.3, 0.32) },
  screen: { pos: new THREE.Vector3(-0.41, 0.6, 1.0), target: new THREE.Vector3(-0.41, 0.45, 0.38) },
};
/** How far the view may slide while zoomed in (scene units). */
const PAN_MIN = new THREE.Vector3(-0.72, 0.05, -0.2);
const PAN_MAX = new THREE.Vector3(0.62, 0.62, 0.75);

interface Prepared {
  model: PreparedModel;
  screen: ScreenRenderer;
}

/** Prepare once per loaded scene (survives React StrictMode double-invocation). */
function getPrepared(scene: THREE.Object3D): Prepared {
  const existing = scene.userData.ibm5100 as Prepared | undefined;
  if (existing) return existing;
  const screen = new ScreenRenderer();
  const prepared = { model: prepareModel(scene, screen.texture), screen };
  scene.userData.ibm5100 = prepared;
  return prepared;
}

interface Props {
  machine: Machine;
  keyBus: KeyBus;
  display: DisplayMode;
  reverse: boolean;
  powered: boolean;
  shot: Shot;
  fx: FxState;
  onKeyClick: (slot: KeySlot) => void;
}

const slotOf = (e: ThreeEvent<MouseEvent | PointerEvent>) => (e.object.userData.keySlot as KeySlot | undefined) ?? null;

function Model({ machine, keyBus, display, reverse, powered, onKeyClick }: Omit<Props, "fx" | "shot">) {
  const { scene } = useGLTF(MODEL_URL, false, true);
  const { model, screen } = useMemo(() => getPrepared(scene), [scene]);

  useEffect(
    () =>
      keyBus.on((code, down) => {
        const k = model.byCode.get(code);
        if (k) k.down = down;
      }),
    [keyBus, model],
  );

  useEffect(() => () => void (document.body.style.cursor = ""), []);

  useFrame((state, dt) => {
    const t = 1 - Math.exp(-dt * 38);
    for (const k of model.keys) {
      const target = k.down ? 1 : 0;
      if (k.amount === target) continue;
      k.amount += (target - k.amount) * t;
      if (Math.abs(k.amount - target) < 0.002) k.amount = target;
      k.mesh.position.y = -k.amount * PRESS_DEPTH;
      k.material.color.copy(k.baseColor).multiplyScalar(1 + k.amount * 0.5);
    }
    screen.update(machine, display, reverse, state.clock.elapsedTime * 1000, powered);

    // incandescent-ish lamps: quick to light, a little slower to fade
    const { inProcess, check } = model.lamps;
    const now = performance.now();
    const lampTo = (lamp: typeof inProcess, on: boolean) => {
      if (!lamp) return;
      const target = on ? 1 : 0;
      lamp.level += (target - lamp.level) * (1 - Math.exp(-dt * (on ? 30 : 9)));
      lamp.material.emissiveIntensity = lamp.level * 4.5;
    };
    lampTo(inProcess, powered && machine.inProcess);
    lampTo(check, powered && machine.checkLit(now));
  });

  return (
    <group scale={SCALE}>
      <primitive
        object={scene}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          const slot = slotOf(e);
          if (!slot) return;
          e.stopPropagation();
          onKeyClick(slot);
        }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          if (!slotOf(e)) return;
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e: ThreeEvent<PointerEvent>) => {
          if (slotOf(e)) document.body.style.cursor = "";
        }}
      />
    </group>
  );
}

/**
 * Fixed viewing angle: the model never rotates. Scroll zooms toward the
 * cursor, dragging slides the view (clamped to the machine), double-click
 * flies back home. Changing `shot` flies the camera to that shot.
 */
function CameraRig({ shot }: { shot: Shot }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, gl } = useThree();
  const goal = useRef<Shot | null>("home");
  const shift = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => void (goal.current = shot), [shot]);

  useEffect(() => {
    const reset = () => (goal.current = "home");
    gl.domElement.addEventListener("dblclick", reset);
    return () => gl.domElement.removeEventListener("dblclick", reset);
  }, [gl]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (goal.current) {
      const { pos, target } = SHOTS[goal.current];
      const t = 1 - Math.exp(-dt * 4);
      camera.position.lerp(pos, t);
      c.target.lerp(target, t);
      if (camera.position.distanceTo(pos) < 0.002) goal.current = null;
    }
    // keep the view on the machine: shift camera + target together
    shift.copy(c.target).clamp(PAN_MIN, PAN_MAX).sub(c.target);
    if (shift.lengthSq() > 0) {
      c.target.add(shift);
      camera.position.add(shift);
    }
    c.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={SHOTS.home.target}
      enableRotate={false}
      screenSpacePanning
      zoomToCursor
      enableDamping
      dampingFactor={0.12}
      minDistance={0.22}
      maxDistance={2.2}
      zoomSpeed={0.9}
      panSpeed={0.9}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }}
      onStart={() => (goal.current = null)}
    />
  );
}

function Room() {
  return (
    <>
      <color attach="background" args={["#0f0d0b"]} />
      <fog attach="fog" args={["#0f0d0b", 3.2, 7]} />
      <ambientLight intensity={0.18} color="#ffe9cc" />
      <directionalLight position={[-2.2, 3.6, 2.6]} intensity={1.35} color="#fff0db" />
      <directionalLight position={[2.6, 1.6, -2.2]} intensity={0.7} color="#a9c3ff" />
      <spotLight position={[0.4, 2.6, 1.4]} angle={0.55} penumbra={0.9} intensity={2.2} color="#ffe2b8" distance={6} />
      {/* desk */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.002, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#2a231c" roughness={0.85} />
      </mesh>
      <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={4} blur={2.4} far={1.2} resolution={512} />
      {/* reflections on the plastic, without downloading an HDRI */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.2} color="#fff4e0" position={[0, 4, 2]} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#cfdcff" position={[-4, 1.5, -2]} scale={[3, 2, 1]} />
      </Environment>
    </>
  );
}

export function Ibm5100Scene({ fx, shot, ...modelProps }: Props) {
  return (
    <>
      <Room />
      <Model {...modelProps} />
      <CameraRig shot={shot} />
      {!NO_FX && (
        <EffectComposer multisampling={4}>
          <CrtEffect fx={fx} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}
    </>
  );
}

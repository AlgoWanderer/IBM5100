import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sounds } from "./audio/sounds";
import { CrtScreen, type Power } from "./components/CrtScreen";
import { SceneErrorBoundary } from "./components/SceneErrorBoundary";
import type { FxState } from "./scene/CrtEffect";
import { KeyBus } from "./scene/KeyBus";
import { loadScene, prefetchSceneWhenIdle } from "./scene/loadScene";
import type { KeySlot } from "./scene/keyMap";
import type { DisplayMode } from "./scene/ScreenTexture";
import { Machine } from "./terminal/Machine";

const HEAVY_KEYS = new Set(["Enter", "NumpadEnter", "Space", "Backspace", "ShiftLeft", "ShiftRight"]);
/** Keys whose browser default (scrolling, focus moves, quick-find) we suppress. */
const SWALLOW = new Set(["Space", "Tab", "Backspace", "Quote", "Slash", "Enter", "NumpadEnter"]);
const FAREWELL = "EL PSY KONGROO.";
/** How long the phosphor keeps glowing after the picture collapses. */
const AFTERGLOW_MS = 2600;

const SceneView = lazy(loadScene);

/** Shown while the 3D chunk itself is still downloading. */
const WARMING = (
  <div className="loading-readout" role="status">
    <span>WARMING UP ........</span>
  </div>
);

const CREDITS = (
  <>
    3D model “IBM5100” by{" "}
    <a href="https://sketchfab.com/3d-models/ibm5100-ba277a88f0b14fe3802d0f4e52afd2cb" target="_blank" rel="noreferrer">
      JP_2793
    </a>{" "}
    (<a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer">CC BY-NC 4.0</a>) · CRT audio by
    artificiallyinspired · Fan project, not affiliated with IBM, MAGES. or 5pb. ·{" "}
    <a href="./copyright.html">© Copyright</a>
  </>
);

export default function App() {
  const machine = useMemo(() => new Machine(), []);
  const keyBus = useMemo(() => new KeyBus(), []);
  const fx = useRef<FxState>({ glitch: 0, noise: 0 }).current;
  const timers = useRef<number[]>([]);

  const [power, setPower] = useState<Power>("off");
  const [everOn, setEverOn] = useState(false);
  const [display, setDisplay] = useState<DisplayMode>("64");
  const [reverse, setReverse] = useState(false);
  const [muted, setMuted] = useState(false);
  const [afterglow, setAfterglow] = useState(false);

  /** The picture is up (keys animate, screen draws). */
  const powered = power === "warming" || power === "on" || power === "farewell";

  // easter-egg effects → shader + sound
  useEffect(() => {
    machine.onEffect = (e, ms) => {
      if (e === "glitch") { fx.glitch = 1.2; sounds.static(0.4, 0.22); }
      if (e === "static") { fx.glitch = 1.6; fx.noise = 0.55; sounds.static(1.1, 0.35); }
      if (e === "divergence") { fx.glitch = 0.5; sounds.beep(1320, 0.18); }
      if (e === "tape" && ms) sounds.tape(ms);
      if (e === "check") sounds.beep(440, 0.09);
    };
    return () => void (machine.onEffect = null);
  }, [machine, fx]);

  useEffect(() => sounds.setMuted(muted), [muted]);
  useEffect(prefetchSceneWhenIdle, []);

  // DISPLAY / REVERSE are real switches: a click, and the picture jumps while it re-syncs
  const flipSwitch = useCallback(() => {
    sounds.click();
    fx.glitch = Math.max(fx.glitch, 0.4);
    fx.noise = Math.max(fx.noise, 0.12);
  }, [fx]);
  const changeDisplay = useCallback((d: DisplayMode) => { flipSwitch(); setDisplay(d); }, [flipSwitch]);
  const changeReverse = useCallback((r: boolean) => { flipSwitch(); setReverse(r); }, [flipSwitch]);

  // ---- power sequence: off → warming → on → farewell → cooling → off ----
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const switchOff = useCallback(() => {
    clearTimers();
    setPower("cooling");
    sounds.powerOff();
    keyBus.releaseAll();
    later(() => {
      machine.powerOff();
      setPower("off");
      setAfterglow(true);
    }, 480);
    later(() => setAfterglow(false), 480 + AFTERGLOW_MS);
  }, [machine, keyBus]);

  const togglePower = useCallback(() => {
    if (power === "off" || power === "cooling") {
      clearTimers();
      setAfterglow(false);
      setEverOn(true);
      setPower("warming");
      void sounds.powerOn();
      later(() => machine.powerOn(), 650);
      later(() => setPower("on"), 1400);
    } else if (power === "on") {
      // sign off on the 5100's screen first, then collapse the picture
      setPower("farewell");
      keyBus.releaseAll();
      machine.farewell(FAREWELL, switchOff);
    } else {
      switchOff(); // pressed again mid-warmup or mid-farewell: just turn off
    }
  }, [power, machine, keyBus, switchOff]);

  // ---- physical keyboard → model + machine ----
  useEffect(() => {
    if (power !== "on" && power !== "warming") return;
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return;
      if (e.ctrlKey) {
        if (e.code === "KeyC") {
          e.preventDefault();
          keyBus.emit("KeyC", true);
          sounds.key();
          machine.key("Break");
        }
        return; // leave other browser shortcuts alone
      }
      if (SWALLOW.has(e.code)) e.preventDefault();
      keyBus.emit(e.code, true);
      if (!e.repeat) sounds.key(HEAVY_KEYS.has(e.code));
      if (e.key === "Enter") machine.key("Enter");
      else if (e.key === "Backspace") machine.key("Backspace");
      else if (e.key.length === 1) machine.key(e.key);
    };
    const up = (e: KeyboardEvent) => keyBus.emit(e.code, false);
    const blur = () => keyBus.releaseAll();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [power, keyBus, machine]);

  // ---- clicking keys on the model ----
  const onKeyClick = useCallback(
    (slot: KeySlot) => {
      if (power !== "on") return;
      const code = slot.codes[0];
      keyBus.emit(code, true);
      window.setTimeout(() => keyBus.emit(code, false), 110);
      sounds.key(HEAVY_KEYS.has(code));
      if (slot.label) machine.key(slot.label);
    },
    [power, keyBus, machine],
  );

  return (
    <CrtScreen
      power={power}
      onPower={togglePower}
      display={display}
      onDisplay={changeDisplay}
      reverse={reverse}
      onReverse={changeReverse}
      afterglow={afterglow}
      onPowerHover={() => void loadScene().catch(() => {})}
      muted={muted}
      onMute={setMuted}
      hint={
        powered
          ? "Type on your keyboard or click the keys · scroll to zoom where you point · drag to slide · double-click to reset · try HELP or DEMO"
          : "Press power to switch the set on."
      }
      credits={CREDITS}
    >
      {everOn && (
        <SceneErrorBoundary>
          <Suspense fallback={WARMING}>
            <SceneView
              running={power !== "off"}
              machine={machine}
              keyBus={keyBus}
              display={display}
              reverse={reverse}
              powered={powered}
              shot={power === "farewell" ? "screen" : "home"}
              fx={fx}
              onKeyClick={onKeyClick}
            />
          </Suspense>
        </SceneErrorBoundary>
      )}
    </CrtScreen>
  );
}

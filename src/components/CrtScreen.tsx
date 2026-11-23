import type { ReactNode } from "react";
import type { DisplayMode } from "../scene/ScreenTexture";

interface Props {
  power: Power;
  onPower: () => void;
  display: DisplayMode;
  onDisplay: (d: DisplayMode) => void;
  reverse: boolean;
  onReverse: (r: boolean) => void;
  muted: boolean;
  onMute: (m: boolean) => void;
  /** The phosphor is still fading after power-off. */
  afterglow: boolean;
  /** Pointer is near the power button: a good moment to start loading. */
  onPowerHover: () => void;
  hint: ReactNode;
  credits: ReactNode;
  children: ReactNode;
}

export type Power = "off" | "warming" | "on" | "farewell" | "cooling";

const DISPLAY_CYCLE: DisplayMode[] = ["64", "L32", "R32"];

function HudButton(props: { label: string; value?: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`hud-btn ${props.active ? "is-active" : ""}`}
      disabled={props.disabled}
      onClick={(e) => {
        props.onClick();
        e.currentTarget.blur(); // keep keyboard focus free for typing
      }}
    >
      {props.label}
      {props.value && <span className="hud-value">{props.value}</span>}
    </button>
  );
}

/** The whole browser window is the CRT: scene underneath, glass + HUD on top. */
export function CrtScreen(p: Props) {
  const on = p.power !== "off" && p.power !== "cooling";
  return (
    <div className={`crt power-${p.power}${p.afterglow ? " has-afterglow" : ""}`}>
      <div className="screen-content">{p.children}</div>

      {p.afterglow && <div className="afterglow" aria-hidden />}

      {p.power === "off" && (
        <button type="button" className="power-prompt" onClick={p.onPower} onPointerEnter={p.onPowerHover} onFocus={p.onPowerHover}>
          <span className="power-prompt-title">[ POWER ON ]</span>
          <span className="power-prompt-sub">sound on · best with headphones</span>
        </button>
      )}

      <div className="screen-glass" aria-hidden />

      <nav className="hud" aria-label="Controls">
        <HudButton
          label="DISPLAY"
          value={p.display}
          disabled={!on}
          onClick={() => p.onDisplay(DISPLAY_CYCLE[(DISPLAY_CYCLE.indexOf(p.display) + 1) % DISPLAY_CYCLE.length])}
        />
        <HudButton label="REVERSE" active={p.reverse} disabled={!on} onClick={() => p.onReverse(!p.reverse)} />
        <HudButton label="SOUND" value={p.muted ? "OFF" : "ON"} active={!p.muted} onClick={() => p.onMute(!p.muted)} />
        <span onPointerEnter={p.onPowerHover}>
          <HudButton label={on ? "POWER OFF" : "POWER ON"} active={on} onClick={p.onPower} />
        </span>
      </nav>

      <footer className="hud-footer">
        <p className="hint">{p.hint}</p>
        <p className="credits">{p.credits}</p>
      </footer>
    </div>
  );
}

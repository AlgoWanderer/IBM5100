// Where each physical key sits on the model, in the GLB's own world units
// (measured with tools/analyze-keys.cjs). x runs left→right, z runs back→front.
// `codes` are KeyboardEvent.code values; `label` is what a click on the model types.

export interface KeySlot {
  codes: string[];
  x: number;
  z: number;
  label?: string; // printable char or "Enter" / "Backspace" / " "
}

const row = (z: number, keys: [string | string[], number, string?][]): KeySlot[] =>
  keys.map(([codes, x, label]) => ({ codes: Array.isArray(codes) ? codes : [codes], x, z, label }));

export const KEY_SLOTS: KeySlot[] = [
  // ---- row 1: digits ----
  // Printed legends, left→right: 1 2 3 4 5 6 7 8 9 0 − (blank) ← →.
  // There is no ` key: the wider key at the far left is "1".
  ...row(0.057, [
    ["Digit1", -0.052, "1"], ["Digit2", -0.045, "2"], ["Digit3", -0.039, "3"],
    ["Digit4", -0.033, "4"], ["Digit5", -0.027, "5"], ["Digit6", -0.021, "6"],
    ["Digit7", -0.015, "7"], ["Digit8", -0.009, "8"], ["Digit9", -0.003, "9"],
    ["Digit0", 0.003, "0"], ["Minus", 0.009, "-"], ["Equal", 0.015, "="],
    [["Backspace", "ArrowLeft"], 0.021, "Backspace"], ["ArrowRight", 0.027],
    // numpad top row: (dark), ↑, ↓, HOLD
    ["NumLock", 0.034], ["ArrowUp", 0.04], ["ArrowDown", 0.046], ["Pause", 0.054],
  ]),
  // ---- row 2: QWERTY ----
  ...row(0.0625, [
    ["KeyQ", -0.047, "Q"], ["KeyW", -0.041, "W"], ["KeyE", -0.035, "E"], ["KeyR", -0.029, "R"],
    ["KeyT", -0.023, "T"], ["KeyY", -0.018, "Y"], ["KeyU", -0.011, "U"], ["KeyI", -0.006, "I"],
    ["KeyO", 0.0, "O"], ["KeyP", 0.006, "P"], ["BracketLeft", 0.012, "["], ["BracketRight", 0.018, "]"],
    ["Numpad7", 0.034, "7"], ["Numpad8", 0.04, "8"], ["Numpad9", 0.046, "9"], ["NumpadDivide", 0.054, "/"],
  ]),
  // tall keys spanning rows 2–3
  ...row(0.065, [
    [["Tab", "CapsLock"], -0.052],
    [["Enter", "NumpadEnter"], 0.025, "Enter"],
  ]),
  // ---- row 3: home row ----
  ...row(0.068, [
    ["KeyA", -0.045, "A"], ["KeyS", -0.039, "S"], ["KeyD", -0.033, "D"], ["KeyF", -0.027, "F"],
    ["KeyG", -0.021, "G"], ["KeyH", -0.015, "H"], ["KeyJ", -0.009, "J"], ["KeyK", -0.003, "K"],
    ["KeyL", 0.003, "L"], ["Semicolon", 0.009, ";"], ["Quote", 0.015, "'"], ["Backslash", 0.021, "\\"],
    ["Numpad4", 0.034, "4"], ["Numpad5", 0.04, "5"], ["Numpad6", 0.046, "6"], ["NumpadMultiply", 0.054, "*"],
  ]),
  // ---- row 4: bottom letters ----
  ...row(0.074, [
    ["ShiftLeft", -0.051],
    ["KeyZ", -0.043, "Z"], ["KeyX", -0.037, "X"], ["KeyC", -0.031, "C"], ["KeyV", -0.025, "V"],
    ["KeyB", -0.019, "B"], ["KeyN", -0.013, "N"], ["KeyM", -0.007, "M"], ["Comma", -0.001, ","],
    ["Period", 0.005, "."], ["Slash", 0.011, "/"], ["IntlBackslash", 0.016],
    ["ShiftRight", 0.024],
    ["Numpad1", 0.034, "1"], ["Numpad2", 0.04, "2"], ["Numpad3", 0.046, "3"], ["NumpadSubtract", 0.054, "-"],
  ]),
  // ---- row 5: space + numpad bottom ----
  ...row(0.079, [
    ["Space", -0.015, " "],
    ["Numpad0", 0.037, "0"], ["NumpadDecimal", 0.046, "."], ["NumpadAdd", 0.054, "+"],
  ]),
];

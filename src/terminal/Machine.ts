import { BasicError } from "./basic/lexer";
import { Basic } from "./basic/interpreter";
import { checkEasterEgg, checkPictureEgg, eggId, EGG_IDS, EGG_TOTAL, type MachineEffect, type PictureEgg } from "./easterEggs";
import { PICTURES, type PictureName } from "./pictures.gen";

export const COLS = 64;
export const ROWS = 16;
const MAX_INPUT = 120;
const TAPE_PREFIX = "ibm5100.tape.";
const FOUND_KEY = "ibm5100.eggs";

/** A picture on screen, anchored to text rows so it scrolls with them. */
export interface Picture {
  name: PictureName;
  /** Text row of the picture's top edge (negative once scrolled partly away). */
  top: number;
  /** How many dot rows have been drawn in so far, 0..PICTURES[name].h. */
  shown: number;
}

type State = "off" | "boot" | "ready" | "running" | "input" | "tape";

/** A tape someone left in the drive. Read-only; shows up in DIR. */
const BUILTIN_TAPES: Record<string, string> = {
  TITOR: `10 REM TAPE RECOVERED. ORIGIN: 2036
20 CLS
30 PRINT "TIMETRAVEL_0 // FIELD LOG"
40 PRINT "MISSION: RETRIEVE ONE IBM 5100. TARGET YEAR 1975."
50 PRINT "REASON: IT CAN READ CODE THE MAINFRAMES FORGOT."
60 PRINT
70 INPUT "WHAT YEAR IS IT WHERE YOU ARE"; Y
80 IF Y >= 2038 THEN GOTO 150
90 PRINT "UNIX TIME RUNS OUT IN"; 2038 - Y; "YEARS."
100 PRINT "  (2038-01-19 03:14:07 UTC. TYPE 2038 TO COUNT IT DOWN.)"
110 IF Y < 2036 THEN PRINT "I LEAVE FOR YOUR TIME IN"; 2036 - Y; "YEARS."
120 IF Y < 1975 THEN PRINT "THIS MACHINE DOES NOT EXIST YET. HOW?"
130 PRINT "KEEP THIS MACHINE SAFE."
140 END
150 PRINT "THEN YOU ALREADY KNOW HOW IT ENDED."
160 PRINT "WORLD LINE DIVERGENCE IS SMALL. NOTHING IS FIXED."
170 END`,
};

const BOOT_LINES: [string, number][] = [
  ["5100 PORTABLE COMPUTER", 260],
  ["MEMORY TEST ........................ 65536 BYTES OK", 520],
  ["TAPE UNIT E80 ...................... READY", 300],
  ["LANGUAGE ........................... BASIC", 300],
  ["", 120],
  ["TYPE HELP FOR A LIST OF COMMANDS.", 200],
  ["", 80],
  ["READY", 0],
];

const HELP = [
  "COMMANDS:  RUN  LIST  NEW  CLS  SAVE \"N\"  LOAD \"N\"  DIR  DEMO",
  "STATEMENTS: PRINT LET INPUT IF..THEN GOTO GOSUB RETURN",
  "            FOR..TO..STEP NEXT DIM END STOP REM",
  "FUNCTIONS:  ABS INT SQR SIN COS TAN ATN EXP LOG SGN RND",
  "            LEN VAL ASC STR$ CHR$ LEFT$ RIGHT$ MID$",
  "ENTER A NUMBERED LINE TO ADD IT TO THE PROGRAM.",
  "CTRL+C STOPS A RUNNING PROGRAM.",
];

const DEMO = `10 REM WORLD LINE SCANNER
20 CLS
30 PRINT "SCANNING WORLD LINES..."
40 FOR I = 1 TO 8
50 D = INT(RND(1) * 1000000) / 1000000
60 PRINT "  LINE"; I; ":"; D
70 NEXT I
80 PRINT "TARGET: 1.048596  (STEINS;GATE)"
90 END`;

/**
 * The 5100's display + keyboard + BASIC, independent of any rendering.
 * The screen is a 64x16 character grid; listeners are told when it changes.
 */
export class Machine {
  grid: string[][] = [];
  row = 0;
  col = 0;
  state: State = "off";
  picture: Picture | null = null;
  /** Bumped on every visible change, so renderers can skip redundant redraws. */
  version = 0;
  /** `ms` is how long the effect lasts, for effects that have a duration (tape). */
  onEffect: ((e: MachineEffect, ms?: number) => void) | null = null;
  /** PROCESS CHECK lamp stays lit until this performance.now() time. */
  private checkUntil = 0;

  private input = "";
  private basic: Basic;
  private timers: number[] = [];
  private runTimer: number | null = null;

  constructor() {
    this.clearGrid();
    this.basic = new Basic({
      write: (s) => this.write(s),
      newline: () => this.newline(),
      column: () => this.col,
      cls: () => this.cls(),
    });
  }

  // ---- power ------------------------------------------------------------

  powerOn() {
    this.powerOff();
    this.state = "boot";
    let delay = 350;
    BOOT_LINES.forEach(([text, wait], i) => {
      this.later(() => {
        this.writeLine(text);
        if (i === BOOT_LINES.length - 1) this.state = "ready";
      }, delay);
      delay += wait;
    });
  }

  powerOff() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.stopRunLoop();
    this.basic.stop();
    this.state = "off";
    this.input = "";
    this.checkUntil = 0;
    this.cls();
  }

  /** Interrupts everything, types a sign-off line, then calls `done`. */
  farewell(text: string, done: () => void) {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.stopRunLoop();
    this.basic.stop();
    this.input = "";
    this.state = "boot"; // ignore typing from here on
    if (this.col !== 0) this.newline();
    this.newline();
    let at = 250;
    for (const ch of text) {
      this.later(() => this.write(ch), at);
      at += ch === " " ? 160 : 85;
    }
    this.later(done, at + 1300);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  // ---- screen -----------------------------------------------------------

  private clearGrid() {
    this.grid = Array.from({ length: ROWS }, () => new Array<string>(COLS).fill(" "));
    this.picture = null;
  }

  private touch() { this.version++; }

  cls() {
    this.clearGrid();
    this.row = 0;
    this.col = 0;
    this.touch();
  }

  private scroll() {
    this.grid.shift();
    this.grid.push(new Array<string>(COLS).fill(" "));
    this.row = ROWS - 1;
    if (this.picture && --this.picture.top + PICTURES[this.picture.name].rows <= 0) this.picture = null;
  }

  private putChar(ch: string) {
    if (this.col >= COLS) this.newline();
    this.grid[this.row][this.col] = ch;
    this.col++;
  }

  write(s: string) {
    for (const ch of s) this.putChar(ch);
    this.touch();
  }

  newline() {
    this.col = 0;
    this.row++;
    if (this.row >= ROWS) this.scroll();
    this.touch();
  }

  writeLine(s: string) {
    this.write(s);
    this.newline();
  }

  // ---- keyboard ---------------------------------------------------------

  /** A single printable character, or "Enter" / "Backspace" / "Break". */
  key(k: string) {
    if (k === "Break") return this.breakProgram();
    if (this.state !== "ready" && this.state !== "input") return;

    if (k === "Enter") {
      const line = this.input;
      this.input = "";
      this.newline();
      if (this.state === "input") this.submitInput(line);
      else this.submitLine(line);
      return;
    }
    if (k === "Backspace") {
      if (!this.input.length) return;
      this.input = this.input.slice(0, -1);
      if (this.col === 0) {
        this.row = Math.max(0, this.row - 1);
        this.col = COLS - 1;
      } else {
        this.col--;
      }
      this.grid[this.row][this.col] = " ";
      this.touch();
      return;
    }
    if (k.length === 1 && this.input.length < MAX_INPUT) {
      const ch = k.toUpperCase();
      this.input += ch;
      this.write(ch);
    }
  }

  /** True when the machine is waiting for the user to type. */
  get acceptsTyping() { return this.state === "ready" || this.state === "input"; }

  /** The front panel's IN PROCESS lamp: lit while the 5100 is busy. */
  get inProcess() { return this.state === "running" || this.state === "tape" || this.state === "boot"; }

  /** The PROCESS CHECK lamp: flashes after an error. */
  checkLit(now = performance.now()) { return now < this.checkUntil; }

  private flagCheck() {
    this.checkUntil = performance.now() + 2500;
    this.onEffect?.("check");
  }

  // ---- tape unit --------------------------------------------------------

  /**
   * Runs the tape for `ms`: prints `label`, adds dots while the reels turn,
   * then calls `done` to print the result. Typing is ignored meanwhile.
   */
  private tape(label: string, ms: number, done: () => void) {
    this.state = "tape";
    this.write(label + " ");
    this.onEffect?.("tape", ms);
    const steps = Math.max(3, Math.round(ms / 180));
    for (let i = 1; i <= steps; i++) this.later(() => this.write("."), (ms * i) / (steps + 1));
    this.later(() => {
      if (this.state !== "tape") return; // powered off mid-tape
      this.newline();
      this.state = "ready";
      done(); // may take the machine busy again
    }, ms);
  }

  private tapeNames(): string[] {
    const names = new Set(Object.keys(BUILTIN_TAPES));
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(TAPE_PREFIX)) names.add(k.slice(TAPE_PREFIX.length));
      }
    } catch { /* storage blocked */ }
    return [...names];
  }

  // ---- 100% completion -------------------------------------------------

  /** Remembers which secrets were found; announces the reward on the last one. */
  private recordFind(id: string) {
    if (!EGG_IDS.has(id)) return;
    let found: string[] = [];
    try { found = JSON.parse(localStorage.getItem(FOUND_KEY) ?? "[]"); } catch { /* storage blocked */ }
    found = found.filter((f) => EGG_IDS.has(f));
    if (found.includes(id)) return;
    found.push(id);
    try { localStorage.setItem(FOUND_KEY, JSON.stringify(found)); } catch { /* storage blocked */ }
    if (found.length < EGG_TOTAL) return;
    this.later(() => {
      if (this.state !== "ready") return;
      this.writeLine("");
      this.writeLine(`*** ACHIEVEMENT: ${EGG_TOTAL}/${EGG_TOTAL} SECRETS FOUND (100%) ***`);
      this.writeLine("  THE LAB LEFT SOMETHING FOR YOU. SAY THANK YOU.");
      this.onEffect?.("divergence");
    }, 900);
  }

  /**
   * A picture egg: found on tape, then drawn in top to bottom like a
   * slow-scan transmission, in the 5100's own phosphor dots.
   */
  private showPicture({ picture, tape, caption }: PictureEgg) {
    const { h, rows } = PICTURES[picture];
    const search = 1500;
    const steps = 36;
    const stepMs = 75;
    this.tape(`SEARCHING ${tape}`, search, () => {
      this.state = "tape"; // keep typing blocked while the picture comes in
      this.cls();
      this.picture = { name: picture, top: 0, shown: 0 };
      this.touch();
      for (let i = 1; i <= steps; i++) {
        this.later(() => {
          if (!this.picture) return;
          this.picture.shown = Math.round((h * i) / steps);
          this.touch();
        }, i * stepMs);
      }
      this.later(() => {
        if (this.state !== "tape") return; // powered off meanwhile
        this.row = rows;
        this.col = 0;
        caption.forEach((l) => this.writeLine(l));
        this.onEffect?.("check");
        this.state = "ready";
      }, steps * stepMs + 400);
    });
    this.later(() => this.onEffect?.("tape", steps * stepMs), search);
  }

  // ---- command handling -------------------------------------------------

  private submitLine(raw: string) {
    const line = raw.trim();
    if (!line) return;

    const picture = checkPictureEgg(line);
    if (picture) return this.showPicture(picture);

    const egg = checkEasterEgg(line);
    if (egg) {
      egg.lines.forEach((l) => this.writeLine(l));
      if (egg.effect) this.onEffect?.(egg.effect);
      this.recordFind(eggId(egg));
      return;
    }

    try {
      const numbered = /^(\d+)\s*(.*)$/.exec(line);
      if (numbered) {
        this.basic.storeLine(Number(numbered[1]), numbered[2]);
        return;
      }
      if (this.command(line)) return;
      this.basic.immediate(line);
      this.startRunLoop();
    } catch (e) {
      this.reportError(e);
    }
  }

  /** Built-in commands that only make sense at the prompt. */
  private command(line: string): boolean {
    const [word, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ").replace(/^"(.*)"?$/, "$1").replace(/"$/, "").trim();
    switch (word) {
      case "RUN":
        this.basic.run();
        this.startRunLoop();
        return true;
      case "LIST": {
        const m = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(rest.join(""));
        let from = 0, to = Infinity;
        if (m && (m[1] || m[3])) {
          from = m[1] ? Number(m[1]) : 0;
          to = m[2] ? (m[3] ? Number(m[3]) : Infinity) : from;
        }
        const out = this.basic.listing(from, to);
        if (!out.length) this.writeLine("NO PROGRAM");
        out.forEach((l) => this.writeLine(l));
        return true;
      }
      case "NEW":
        this.basic.newProgram();
        this.writeLine("READY");
        return true;
      case "CLS":
      case "CLEAR":
        this.cls();
        return true;
      case "HELP":
        HELP.forEach((l) => this.writeLine(l));
        return true;
      case "DEMO":
        this.basic.loadSource(DEMO);
        this.writeLine("DEMO LOADED. TYPE LIST OR RUN.");
        return true;
      case "SAVE": {
        if (!arg) { this.writeLine("?NAME REQUIRED: SAVE \"NAME\""); this.flagCheck(); return true; }
        if (arg in BUILTIN_TAPES) { this.writeLine(`?FILE PROTECTED: ${arg}`); this.flagCheck(); return true; }
        const src = this.basic.source();
        const lines = this.basic.programSize;
        this.tape(`WRITING ${arg}`, 900 + Math.min(lines, 60) * 35, () => {
          try {
            localStorage.setItem(TAPE_PREFIX + arg, src);
            this.writeLine(`SAVED ${arg} TO TAPE (${lines} LINES)`);
          } catch {
            this.writeLine("?TAPE ERROR");
            this.flagCheck();
          }
        });
        return true;
      }
      case "LOAD": {
        if (!arg) { this.writeLine("?NAME REQUIRED: LOAD \"NAME\""); this.flagCheck(); return true; }
        let src: string | null = BUILTIN_TAPES[arg] ?? null;
        if (src === null) {
          try { src = localStorage.getItem(TAPE_PREFIX + arg); } catch { /* storage blocked */ }
        }
        const found = src;
        this.tape(`SEARCHING ${arg}`, found === null ? 1800 : 1100 + found.split(/\n/).length * 30, () => {
          if (found === null) { this.writeLine(`?FILE NOT FOUND: ${arg}`); this.flagCheck(); return; }
          this.basic.loadSource(found);
          this.writeLine(`LOADED ${arg}`);
        });
        return true;
      }
      case "DIR":
      case "FILES": {
        const names = this.tapeNames();
        this.tape("REWINDING", 1300, () => this.writeLine(names.length ? "TAPE: " + names.join("  ") : "TAPE IS EMPTY"));
        return true;
      }
    }
    return false;
  }

  private submitInput(text: string) {
    try {
      if (!this.basic.provideInput(text)) {
        this.write(this.basic.inputPrompt ?? "? ");
        return;
      }
      this.state = "running";
      this.startRunLoop();
    } catch (e) {
      this.reportError(e);
    }
  }

  private reportError(e: unknown) {
    const line = this.basic.currentLine();
    this.basic.stop();
    this.stopRunLoop();
    if (this.col !== 0) this.newline();
    this.flagCheck();
    if (e instanceof BasicError) {
      this.writeLine(`?${e.message}${line !== null ? ` IN ${line}` : ""}`);
    } else {
      console.error(e);
      this.writeLine("?SYSTEM ERROR");
    }
    this.writeLine("READY");
    this.state = "ready";
  }

  private breakProgram() {
    if (this.state !== "running" && this.state !== "input") return;
    const line = this.basic.currentLine();
    this.basic.stop();
    this.stopRunLoop();
    this.input = "";
    if (this.col !== 0) this.newline();
    this.writeLine(line !== null ? `BREAK IN ${line}` : "BREAK");
    this.writeLine("READY");
    this.state = "ready";
  }

  // ---- run loop ---------------------------------------------------------

  private startRunLoop() {
    this.state = "running";
    this.stopRunLoop();
    const tick = () => {
      const t0 = performance.now();
      try {
        let result = this.basic.step(250);
        // slower than a modern PC on purpose: ~2k statements per frame at most
        while (result === "running" && performance.now() - t0 < 6) result = this.basic.step(250);
        if (result === "input") { this.state = "input"; this.runTimer = null; return; }
        if (result === "done") { this.runTimer = null; this.finishRun(); return; }
      } catch (e) {
        this.runTimer = null;
        this.reportError(e);
        return;
      }
      this.runTimer = window.setTimeout(tick, 16);
    };
    this.runTimer = window.setTimeout(tick, 0);
  }

  private stopRunLoop() {
    if (this.runTimer !== null) clearTimeout(this.runTimer);
    this.runTimer = null;
  }

  private finishRun() {
    if (this.col !== 0) this.newline();
    this.writeLine("READY");
    this.state = "ready";
  }
}

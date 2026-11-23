import { BasicError } from "./lexer";
import { type Expr, type Stmt, type Target, parseStatements } from "./parser";

type Value = number | string;

/** What the interpreter needs from the screen. */
export interface BasicIO {
  write(s: string): void;
  newline(): void;
  column(): number;
  cls(): void;
}

type Pos = { li: number; si: number }; // li === -1 → the immediate-mode line
type Arr = { dims: number[]; data: Value[] };

type StepResult = "running" | "input" | "done";

const ZONE = 16;

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new BasicError("OVERFLOW");
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e9 || a < 1e-4) {
    return n.toExponential(5).toUpperCase().replace(/\.?0+E/, "E").replace("E+", "E");
  }
  return String(Number(n.toPrecision(9)));
}

const isStrName = (name: string) => name.endsWith("$");

export class Basic {
  private lines = new Map<number, { src: string; stmts: Stmt[] }>();
  private order: number[] = [];
  private vars = new Map<string, Value>();
  private arrays = new Map<string, Arr>();
  private forStack: { v: string; to: number; step: number; body: Pos }[] = [];
  private subStack: Pos[] = [];
  private imm: Stmt[] = [];
  private pc: Pos | null = null;
  private pendingInput: { targets: Target[]; prompt: string } | null = null;

  constructor(private io: BasicIO) {}

  // ---- program editing --------------------------------------------------

  /** Stores (or deletes, if the body is empty) a numbered program line. */
  storeLine(n: number, body: string) {
    if (n < 1 || n > 9999) throw new BasicError("ILLEGAL LINE NUMBER");
    if (body.trim() === "") {
      this.lines.delete(n);
    } else {
      this.lines.set(n, { src: body.trim(), stmts: parseStatements(body) });
    }
    this.order = [...this.lines.keys()].sort((a, b) => a - b);
  }

  listing(from = 0, to = Infinity): string[] {
    return this.order.filter((n) => n >= from && n <= to).map((n) => `${n} ${this.lines.get(n)!.src}`);
  }

  source(): string { return this.listing().join("\n"); }

  loadSource(src: string) {
    this.newProgram();
    for (const raw of src.split("\n")) {
      const m = /^\s*(\d+)\s?(.*)$/.exec(raw);
      if (m) this.storeLine(Number(m[1]), m[2]);
    }
  }

  get programSize() { return this.order.length; }

  newProgram() {
    this.lines.clear();
    this.order = [];
    this.clearState();
  }

  private clearState() {
    this.vars.clear();
    this.arrays.clear();
    this.forStack = [];
    this.subStack = [];
    this.pc = null;
    this.pendingInput = null;
  }

  // ---- execution control ------------------------------------------------

  run() {
    this.clearState();
    if (this.order.length) this.pc = { li: 0, si: 0 };
  }

  immediate(src: string) {
    this.imm = parseStatements(src);
    this.pc = { li: -1, si: 0 };
  }

  /** The program line currently executing (null in immediate mode). */
  currentLine(): number | null {
    if (!this.pc || this.pc.li < 0) return null;
    return this.order[this.pc.li] ?? null;
  }

  stop() {
    this.pc = null;
    this.pendingInput = null;
  }

  get inputPrompt() { return this.pendingInput?.prompt ?? null; }

  /** Feeds a line typed in response to INPUT. Returns false if it must be re-entered. */
  provideInput(text: string): boolean {
    const req = this.pendingInput;
    if (!req) return true;
    const parts = text.split(",");
    const values: Value[] = [];
    for (let i = 0; i < req.targets.length; i++) {
      const t = req.targets[i];
      const raw = (parts[i] ?? "").trim();
      if (isStrName(t.name)) {
        values.push(raw.replace(/^"(.*)"$/, "$1"));
      } else {
        const n = raw === "" ? 0 : Number(raw);
        if (Number.isNaN(n)) {
          this.io.write("?REDO FROM START");
          this.io.newline();
          return false;
        }
        values.push(n);
      }
    }
    req.targets.forEach((t, i) => this.assign(t, values[i]));
    this.pendingInput = null;
    return true;
  }

  /** Runs up to `budget` statements. Throws BasicError on runtime errors. */
  step(budget: number): StepResult {
    while (budget-- > 0) {
      if (this.pendingInput) return "input";
      const pc = this.pc;
      if (!pc) return "done";
      const stmts = pc.li === -1 ? this.imm : this.lines.get(this.order[pc.li])?.stmts;
      if (!stmts) { this.pc = null; return "done"; }
      if (pc.si >= stmts.length) {
        if (pc.li === -1 || pc.li + 1 >= this.order.length) { this.pc = null; return "done"; }
        this.pc = { li: pc.li + 1, si: 0 };
        continue;
      }
      const s = stmts[pc.si];
      this.pc = { li: pc.li, si: pc.si + 1 };
      this.exec(s, pc);
    }
    if (this.pendingInput) return "input";
    return this.pc ? "running" : "done";
  }

  private jump(n: number) {
    const li = this.order.indexOf(n);
    if (li === -1) throw new BasicError(`UNDEFINED LINE ${n}`);
    this.pc = { li, si: 0 };
  }

  private exec(s: Stmt, at: Pos) {
    switch (s.k) {
      case "rem": return;
      case "print": return this.print(s.items);
      case "let": return this.assign(s.target, this.eval(s.e));
      case "input": {
        const prompt = (s.prompt ?? "") + "? ";
        this.pendingInput = { targets: s.targets, prompt };
        this.io.write(prompt);
        return;
      }
      case "if": {
        if (!this.truthy(this.eval(s.cond))) {
          // skip the rest of this line
          if (at.li === -1) this.pc = { li: -1, si: Infinity };
          else this.pc = { li: at.li, si: Infinity };
        }
        return;
      }
      case "goto": return this.jump(s.n);
      case "gosub": {
        this.subStack.push(this.pc!);
        if (this.subStack.length > 200) throw new BasicError("OUT OF MEMORY");
        return this.jump(s.n);
      }
      case "return": {
        const r = this.subStack.pop();
        if (!r) throw new BasicError("RETURN WITHOUT GOSUB");
        this.pc = r;
        return;
      }
      case "for": {
        const from = this.num(this.eval(s.from));
        const to = this.num(this.eval(s.to));
        const step = s.step ? this.num(this.eval(s.step)) : 1;
        this.vars.set(s.v, from);
        // re-entering a FOR for the same variable replaces the old loop
        this.forStack = this.forStack.filter((f) => f.v !== s.v);
        this.forStack.push({ v: s.v, to, step, body: this.pc! });
        return;
      }
      case "next": {
        let idx = this.forStack.length - 1;
        if (s.v) while (idx >= 0 && this.forStack[idx].v !== s.v) idx--;
        if (idx < 0) throw new BasicError("NEXT WITHOUT FOR");
        const f = this.forStack[idx];
        this.forStack.length = idx + 1;
        const v = this.num(this.vars.get(f.v) ?? 0) + f.step;
        this.vars.set(f.v, v);
        const more = f.step >= 0 ? v <= f.to : v >= f.to;
        if (more) this.pc = f.body;
        else this.forStack.pop();
        return;
      }
      case "dim": {
        for (const a of s.arrays) {
          if (this.arrays.has(a.name)) throw new BasicError("REDIMENSIONED ARRAY");
          const dims = a.dims.map((d) => Math.floor(this.num(this.eval(d))) + 1);
          if (dims.some((d) => d < 1) || dims.reduce((x, y) => x * y, 1) > 10000) {
            throw new BasicError("ILLEGAL QUANTITY");
          }
          this.arrays.set(a.name, this.makeArray(a.name, dims));
        }
        return;
      }
      case "end": this.pc = null; return;
      case "stop": {
        const line = at.li >= 0 ? this.order[at.li] : null;
        this.pc = null;
        this.io.write(line !== null ? `BREAK IN ${line}` : "BREAK");
        this.io.newline();
        return;
      }
      case "cls": this.io.cls(); return;
      case "randomize": return;
    }
  }

  private print(items: ({ e: Expr } | { sep: ";" | "," })[]) {
    let trailingSep = false;
    for (const it of items) {
      if ("sep" in it) {
        trailingSep = true;
        if (it.sep === ",") {
          const col = this.io.column();
          const pad = ZONE - (col % ZONE);
          this.io.write(" ".repeat(pad));
        }
        continue;
      }
      trailingSep = false;
      const v = this.eval(it.e);
      if (typeof v === "string") this.io.write(v);
      else this.io.write((v >= 0 ? " " : "") + formatNumber(v) + " ");
    }
    if (!trailingSep) this.io.newline();
  }

  // ---- variables & arrays -----------------------------------------------

  private makeArray(name: string, dims: number[]): Arr {
    const size = dims.reduce((x, y) => x * y, 1);
    return { dims, data: new Array<Value>(size).fill(isStrName(name) ? "" : 0) };
  }

  private arrayIndex(name: string, idx: Expr[]): { arr: Arr; i: number } {
    let arr = this.arrays.get(name);
    if (!arr) {
      // classic BASIC: arrays used without DIM get 11 slots (0..10) per dimension
      arr = this.makeArray(name, idx.map(() => 11));
      this.arrays.set(name, arr);
    }
    if (idx.length !== arr.dims.length) throw new BasicError("BAD SUBSCRIPT");
    let i = 0;
    idx.forEach((e, d) => {
      const n = Math.floor(this.num(this.eval(e)));
      if (n < 0 || n >= arr!.dims[d]) throw new BasicError("BAD SUBSCRIPT");
      i = i * arr!.dims[d] + n;
    });
    return { arr, i };
  }

  private assign(t: Target, v: Value) {
    if (isStrName(t.name) !== (typeof v === "string")) throw new BasicError("TYPE MISMATCH");
    if (t.idx) {
      const { arr, i } = this.arrayIndex(t.name, t.idx);
      arr.data[i] = v;
    } else {
      this.vars.set(t.name, v);
    }
  }

  // ---- expressions ------------------------------------------------------

  private num(v: Value): number {
    if (typeof v !== "number") throw new BasicError("TYPE MISMATCH");
    return v;
  }
  private str(v: Value): string {
    if (typeof v !== "string") throw new BasicError("TYPE MISMATCH");
    return v;
  }
  private truthy(v: Value) { return typeof v === "string" ? v !== "" : v !== 0; }

  private eval(e: Expr): Value {
    switch (e.k) {
      case "num": return e.v;
      case "str": return e.v;
      case "var": {
        if (e.idx) {
          const { arr, i } = this.arrayIndex(e.name, e.idx);
          return arr.data[i];
        }
        return this.vars.get(e.name) ?? (isStrName(e.name) ? "" : 0);
      }
      case "un": {
        const v = this.eval(e.e);
        if (e.op === "-") return -this.num(v);
        return this.truthy(v) ? 0 : -1; // NOT
      }
      case "bin": return this.binary(e.op, this.eval(e.l), this.eval(e.r));
      case "call": return this.call(e.name, e.args.map((a) => this.eval(a)));
    }
  }

  private binary(op: string, l: Value, r: Value): Value {
    const bool = (b: boolean) => (b ? -1 : 0);
    switch (op) {
      case "+":
        if (typeof l === "string" && typeof r === "string") {
          if (l.length + r.length > 255) throw new BasicError("STRING TOO LONG");
          return l + r;
        }
        return this.num(l) + this.num(r);
      case "-": return this.num(l) - this.num(r);
      case "*": return this.num(l) * this.num(r);
      case "/": {
        const d = this.num(r);
        if (d === 0) throw new BasicError("DIVISION BY ZERO");
        return this.num(l) / d;
      }
      case "^": return Math.pow(this.num(l), this.num(r));
      case "AND": return bool(this.truthy(l) && this.truthy(r));
      case "OR": return bool(this.truthy(l) || this.truthy(r));
    }
    if (typeof l !== typeof r) throw new BasicError("TYPE MISMATCH");
    switch (op) {
      case "=": return bool(l === r);
      case "<>": return bool(l !== r);
      case "<": return bool(l < r);
      case ">": return bool(l > r);
      case "<=": return bool(l <= r);
      case ">=": return bool(l >= r);
    }
    throw new BasicError("SYNTAX ERROR");
  }

  private call(name: string, a: Value[]): Value {
    const n = (i: number) => this.num(a[i]);
    const s = (i: number) => this.str(a[i]);
    switch (name) {
      case "ABS": return Math.abs(n(0));
      case "INT": return Math.floor(n(0));
      case "SQR": {
        if (n(0) < 0) throw new BasicError("ILLEGAL QUANTITY");
        return Math.sqrt(n(0));
      }
      case "SIN": return Math.sin(n(0));
      case "COS": return Math.cos(n(0));
      case "TAN": return Math.tan(n(0));
      case "ATN": return Math.atan(n(0));
      case "EXP": return Math.exp(n(0));
      case "LOG": {
        if (n(0) <= 0) throw new BasicError("ILLEGAL QUANTITY");
        return Math.log(n(0));
      }
      case "SGN": return Math.sign(n(0));
      case "RND": return Math.random();
      case "LEN": return s(0).length;
      case "VAL": { const v = parseFloat(s(0)); return Number.isNaN(v) ? 0 : v; }
      case "ASC": {
        if (!s(0).length) throw new BasicError("ILLEGAL QUANTITY");
        return s(0).charCodeAt(0);
      }
      case "STR$": return (n(0) >= 0 ? " " : "") + formatNumber(n(0));
      case "CHR$": return String.fromCharCode(Math.max(0, Math.min(255, Math.floor(n(0)))));
      case "LEFT$": return s(0).slice(0, Math.max(0, Math.floor(n(1))));
      case "RIGHT$": {
        const k = Math.max(0, Math.floor(n(1)));
        return k === 0 ? "" : s(0).slice(-k);
      }
      case "MID$": {
        const start = Math.max(1, Math.floor(n(1))) - 1;
        return a.length > 2 ? s(0).substr(start, Math.max(0, Math.floor(n(2)))) : s(0).slice(start);
      }
    }
    throw new BasicError("SYNTAX ERROR");
  }
}

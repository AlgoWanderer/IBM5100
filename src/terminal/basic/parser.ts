import { BasicError, type Tok, tokenize } from "./lexer";

export type Expr =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "var"; name: string; idx?: Expr[] }
  | { k: "un"; op: string; e: Expr }
  | { k: "bin"; op: string; l: Expr; r: Expr }
  | { k: "call"; name: string; args: Expr[] };

export type Target = { name: string; idx?: Expr[] };

export type Stmt =
  | { k: "print"; items: ({ e: Expr } | { sep: ";" | "," })[] }
  | { k: "let"; target: Target; e: Expr }
  | { k: "input"; prompt: string | null; targets: Target[] }
  | { k: "if"; cond: Expr } // false → skip rest of line
  | { k: "goto"; n: number }
  | { k: "gosub"; n: number }
  | { k: "return" }
  | { k: "for"; v: string; from: Expr; to: Expr; step: Expr | null }
  | { k: "next"; v: string | null }
  | { k: "dim"; arrays: { name: string; dims: Expr[] }[] }
  | { k: "end" }
  | { k: "stop" }
  | { k: "cls" }
  | { k: "randomize" }
  | { k: "rem" };

/** Names callable as functions, with their arity range. */
const FUNCS: Record<string, [number, number]> = {
  ABS: [1, 1], INT: [1, 1], SQR: [1, 1], SIN: [1, 1], COS: [1, 1], TAN: [1, 1],
  ATN: [1, 1], EXP: [1, 1], LOG: [1, 1], SGN: [1, 1], RND: [0, 1],
  LEN: [1, 1], VAL: [1, 1], ASC: [1, 1], "STR$": [1, 1], "CHR$": [1, 1],
  "LEFT$": [2, 2], "RIGHT$": [2, 2], "MID$": [2, 3],
};

const syntax = () => new BasicError("SYNTAX ERROR");

class Parser {
  private p = 0;
  constructor(private toks: Tok[]) {}

  peek(): Tok | undefined { return this.toks[this.p]; }
  next(): Tok {
    const t = this.toks[this.p++];
    if (!t) throw syntax();
    return t;
  }
  isOp(v: string) { const t = this.peek(); return t?.t === "op" && t.v === v; }
  isKw(v: string) { const t = this.peek(); return t?.t === "kw" && t.v === v; }
  eatOp(v: string) { if (this.isOp(v)) { this.p++; return true; } return false; }
  eatKw(v: string) { if (this.isKw(v)) { this.p++; return true; } return false; }
  expectOp(v: string) { if (!this.eatOp(v)) throw syntax(); }
  expectKw(v: string) { if (!this.eatKw(v)) throw syntax(); }
  /** End of statement: end of line or ':' (not consumed). */
  atStmtEnd() { const t = this.peek(); return !t || (t.t === "op" && t.v === ":"); }
  eof() { return this.p >= this.toks.length; }

  lineNumber(): number {
    const t = this.next();
    if (t.t !== "num" || !Number.isInteger(t.v)) throw syntax();
    return t.v;
  }

  // ---- statements -------------------------------------------------------

  line(): Stmt[] {
    const out: Stmt[] = [];
    while (!this.eof()) {
      if (this.eatOp(":")) continue;
      const t = this.peek()!;
      if (t.t === "rem") { this.p++; out.push({ k: "rem" }); break; }
      if (t.t === "kw" && t.v === "IF") {
        this.p++;
        const cond = this.expr();
        if (this.eatKw("GOTO")) {
          out.push({ k: "if", cond }, { k: "goto", n: this.lineNumber() });
        } else {
          this.expectKw("THEN");
          out.push({ k: "if", cond });
          const nt = this.peek();
          if (nt?.t === "num") out.push({ k: "goto", n: this.lineNumber() });
          continue; // statements after THEN belong to the IF; no ':' required
        }
      } else {
        out.push(...this.statement());
      }
      if (!this.eof()) this.expectOp(":");
    }
    return out;
  }

  statement(): Stmt[] {
    const t = this.next();
    if (t.t === "id") { this.p--; return [this.assignment()]; }
    if (t.t !== "kw") throw syntax();
    switch (t.v) {
      case "LET": return [this.assignment()];
      case "PRINT": return [this.print()];
      case "INPUT": return [this.input()];
      case "GOTO": return [{ k: "goto", n: this.lineNumber() }];
      case "GOSUB": return [{ k: "gosub", n: this.lineNumber() }];
      case "RETURN": return [{ k: "return" }];
      case "END": return [{ k: "end" }];
      case "STOP": return [{ k: "stop" }];
      case "CLS": return [{ k: "cls" }];
      case "RANDOMIZE": return [{ k: "randomize" }];
      case "FOR": {
        const v = this.next();
        if (v.t !== "id" || v.v.endsWith("$")) throw syntax();
        this.expectOp("=");
        const from = this.expr();
        this.expectKw("TO");
        const to = this.expr();
        const step = this.eatKw("STEP") ? this.expr() : null;
        return [{ k: "for", v: v.v, from, to, step }];
      }
      case "NEXT": {
        if (this.atStmtEnd()) return [{ k: "next", v: null }];
        const out: Stmt[] = [];
        do {
          const v = this.next();
          if (v.t !== "id") throw syntax();
          out.push({ k: "next", v: v.v });
        } while (this.eatOp(","));
        return out;
      }
      case "DIM": {
        const arrays: { name: string; dims: Expr[] }[] = [];
        do {
          const v = this.next();
          if (v.t !== "id") throw syntax();
          this.expectOp("(");
          arrays.push({ name: v.v, dims: this.args() });
        } while (this.eatOp(","));
        return [{ k: "dim", arrays }];
      }
      default:
        throw syntax();
    }
  }

  target(): Target {
    const v = this.next();
    if (v.t !== "id" || FUNCS[v.v]) throw syntax();
    if (this.eatOp("(")) return { name: v.v, idx: this.args() };
    return { name: v.v };
  }

  assignment(): Stmt {
    const target = this.target();
    this.expectOp("=");
    return { k: "let", target, e: this.expr() };
  }

  print(): Stmt {
    const items: ({ e: Expr } | { sep: ";" | "," })[] = [];
    while (!this.atStmtEnd()) {
      if (this.eatOp(";")) items.push({ sep: ";" });
      else if (this.eatOp(",")) items.push({ sep: "," });
      else items.push({ e: this.expr() });
    }
    return { k: "print", items };
  }

  input(): Stmt {
    let prompt: string | null = null;
    const t = this.peek();
    if (t?.t === "str") {
      this.p++;
      prompt = t.v;
      if (!this.eatOp(";")) this.expectOp(",");
    }
    const targets: Target[] = [];
    do targets.push(this.target()); while (this.eatOp(","));
    return { k: "input", prompt, targets };
  }

  /** Parses `a, b, c)` — the opening paren is already consumed. */
  args(): Expr[] {
    const out: Expr[] = [];
    if (this.eatOp(")")) return out;
    do out.push(this.expr()); while (this.eatOp(","));
    this.expectOp(")");
    return out;
  }

  // ---- expressions (lowest → highest precedence) ------------------------

  expr(): Expr { return this.or(); }

  or(): Expr {
    let l = this.and();
    while (this.eatKw("OR")) l = { k: "bin", op: "OR", l, r: this.and() };
    return l;
  }
  and(): Expr {
    let l = this.not();
    while (this.eatKw("AND")) l = { k: "bin", op: "AND", l, r: this.not() };
    return l;
  }
  not(): Expr {
    if (this.eatKw("NOT")) return { k: "un", op: "NOT", e: this.not() };
    return this.cmp();
  }
  cmp(): Expr {
    let l = this.add();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && ["=", "<>", "<", ">", "<=", ">="].includes(t.v)) {
        this.p++;
        l = { k: "bin", op: t.v, l, r: this.add() };
      } else return l;
    }
  }
  add(): Expr {
    let l = this.mul();
    for (;;) {
      if (this.eatOp("+")) l = { k: "bin", op: "+", l, r: this.mul() };
      else if (this.eatOp("-")) l = { k: "bin", op: "-", l, r: this.mul() };
      else return l;
    }
  }
  mul(): Expr {
    let l = this.unary();
    for (;;) {
      if (this.eatOp("*")) l = { k: "bin", op: "*", l, r: this.unary() };
      else if (this.eatOp("/")) l = { k: "bin", op: "/", l, r: this.unary() };
      else return l;
    }
  }
  unary(): Expr {
    if (this.eatOp("-")) return { k: "un", op: "-", e: this.unary() };
    if (this.eatOp("+")) return this.unary();
    return this.pow();
  }
  pow(): Expr {
    const base = this.primary();
    if (this.eatOp("^")) return { k: "bin", op: "^", l: base, r: this.unary() };
    return base;
  }
  primary(): Expr {
    const t = this.next();
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const e = this.expr();
      this.expectOp(")");
      return e;
    }
    if (t.t === "id") {
      const fn = FUNCS[t.v];
      if (fn) {
        let args: Expr[] = [];
        if (this.eatOp("(")) args = this.args();
        if (args.length < fn[0] || args.length > fn[1]) throw syntax();
        return { k: "call", name: t.v, args };
      }
      if (this.eatOp("(")) return { k: "var", name: t.v, idx: this.args() };
      return { k: "var", name: t.v };
    }
    throw syntax();
  }
}

export function parseStatements(src: string): Stmt[] {
  return new Parser(tokenize(src)).line();
}

// Tokenizer for the 5100's BASIC dialect (a small, classic line-numbered BASIC).
// Source is expected to already be upper-case; the machine forces caps on input.

export type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "kw"; v: string }
  | { t: "op"; v: string }
  | { t: "rem" };

export class BasicError extends Error {}

const KEYWORDS = new Set([
  "PRINT", "LET", "INPUT", "IF", "THEN", "GOTO", "GOSUB", "RETURN", "FOR", "TO",
  "STEP", "NEXT", "END", "STOP", "CLS", "AND", "OR", "NOT", "RANDOMIZE", "DIM",
]);

const NUM_RE = /^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/;
const WORD_RE = /^[A-Z][A-Z0-9]*\$?/;

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t") { i++; continue; }

    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = NUM_RE.exec(src.slice(i))!;
      out.push({ t: "num", v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }

    if (ch === '"') {
      const j = src.indexOf('"', i + 1);
      const end = j === -1 ? src.length : j;
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    if (/[A-Z]/.test(ch)) {
      const w = WORD_RE.exec(src.slice(i))![0];
      i += w.length;
      if (w === "REM") { out.push({ t: "rem" }); break; }
      out.push(KEYWORDS.has(w) ? { t: "kw", v: w } : { t: "id", v: w });
      continue;
    }

    if (ch === "'") { out.push({ t: "rem" }); break; }

    const two = src.slice(i, i + 2);
    if (two === "<>" || two === "<=" || two === ">=" || two === "><") {
      out.push({ t: "op", v: two === "><" ? "<>" : two });
      i += 2;
      continue;
    }
    if (ch === "?") { out.push({ t: "kw", v: "PRINT" }); i++; continue; }
    if ("+-*/^=<>(),;:".includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }

    throw new BasicError("SYNTAX ERROR");
  }
  return out;
}

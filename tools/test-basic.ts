// Unit checks for the BASIC interpreter. Run: npm run test:basic
import { BasicError } from "../src/terminal/basic/lexer";
import { Basic } from "../src/terminal/basic/interpreter";

let out = "";
let col = 0;
const io = {
  write: (s: string) => { out += s; col += s.length; },
  newline: () => { out += "\n"; col = 0; },
  column: () => col,
  cls: () => { out += "[CLS]\n"; col = 0; },
};

let failures = 0;
function check(name: string, actual: string, expected: string) {
  if (actual === expected) return console.log(`ok   ${name}`);
  failures++;
  console.log(`FAIL ${name}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
}

function run(program: string, input?: string): string {
  const b = new Basic(io);
  out = ""; col = 0;
  b.loadSource(program);
  b.run();
  let r = b.step(100000);
  if (r === "input" && input !== undefined) { b.provideInput(input); r = b.step(100000); }
  return out;
}

check("print + precedence", run(`10 PRINT "A"; 2+3*4; -2^2`), "A 14 -4 \n");
check("for/next", run(`10 FOR I = 1 TO 3 : PRINT I; : NEXT I`), " 1  2  3 ");
check("step down", run(`10 FOR I = 3 TO 1 STEP -1 : PRINT I; : NEXT`), " 3  2  1 ");
check("strings", run(`10 A$ = "STEINS" : PRINT LEFT$(A$,2); LEN(A$); MID$(A$,3,2); RIGHT$(A$,1)`), "ST 6 EIS\n");
check("if then rest of line", run(`10 IF 1 > 2 THEN PRINT "NO" : PRINT "SKIP"\n20 PRINT "YES"`), "YES\n");
check("gosub/return", run(`10 GOSUB 100\n20 END\n100 PRINT "SUB" : RETURN`), "SUB\n");
check("arrays", run(`10 DIM X(5) : X(3) = 7 : PRINT X(3) * 2`), " 14 \n");
// " 1 " is 3 chars, the comma pads to column 16, then " 2 " prints its sign space
check("comma zones", run(`10 PRINT 1, 2`), " 1 " + " ".repeat(13) + " 2 \n");
check("input", run(`10 INPUT "NAME"; N$ : PRINT "HI "; N$`, "OKABE"), "NAME? HI OKABE\n");

try {
  run(`10 PRINT 1/0`);
  check("division by zero throws", "no error", "error");
} catch (e) {
  check("division by zero throws", (e as BasicError).message, "DIVISION BY ZERO");
}
try {
  run(`10 GOTO 50`);
  check("undefined line throws", "no error", "error");
} catch (e) {
  check("undefined line throws", (e as BasicError).message, "UNDEFINED LINE 50");
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log("\nall passed");

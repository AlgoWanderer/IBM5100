// Hidden words for Steins;Gate fans. Checked before BASIC sees the line.

export type MachineEffect = "glitch" | "divergence" | "static" | "tape" | "check";

interface EggResult {
  lines: string[];
  effect?: MachineEffect;
}

const DIGITS: Record<string, string[]> = {
  "0": ["###", "# #", "# #", "# #", "###"],
  "1": [" # ", "## ", " # ", " # ", "###"],
  "2": ["###", "  #", "###", "#  ", "###"],
  "3": ["###", "  #", " ##", "  #", "###"],
  "4": ["# #", "# #", "###", "  #", "  #"],
  "5": ["###", "#  ", "###", "  #", "###"],
  "6": ["###", "#  ", "###", "# #", "###"],
  "7": ["###", "  #", "  #", "  #", "  #"],
  "8": ["###", "# #", "###", "# #", "###"],
  "9": ["###", "# #", "###", "  #", "###"],
  ".": ["   ", "   ", "   ", "   ", " # "],
};

/** Renders a number as big 3x5 block digits, like a nixie-tube meter. */
function bigNumber(text: string): string[] {
  const rows = ["", "", "", "", ""];
  for (const ch of text) {
    const g = DIGITS[ch];
    if (!g) continue;
    g.forEach((r, i) => (rows[i] += r.replace(/#/g, "█") + " "));
  }
  return rows.map((r) => "  " + r);
}

/** World-lines the meter can land on: mostly the "true" one, sometimes not. */
const WORLD_LINES = ["1.048596", "0.571024", "0.523307", "1.130205", "0.337187"];

/** 2038-01-19 03:14:07 UTC: the last second a signed 32-bit Unix clock can hold. */
const Y2038 = Date.UTC(2038, 0, 19, 3, 14, 7);

function y2038Countdown(): string[] {
  const left = Math.max(0, Math.floor((Y2038 - Date.now()) / 1000));
  const days = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    "UNIX TIME OVERFLOW (Y2K38)",
    "  MAX SIGNED 32-BIT TIME .. 2147483647",
    "  THAT IS ................. 2038-01-19 03:14:07 UTC",
    `  TIME REMAINING .......... ${days} DAYS ${pad(h)}:${pad(m)}:${pad(s)}`,
    "  AFTER THAT, OLD CLOCKS WRAP TO 1901.",
    "",
    "  THIS IS WHY THEY CAME BACK FOR THE 5100.",
  ];
}

export function checkEasterEgg(input: string): EggResult | null {
  const w = input.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  switch (w) {
    // ---- John Titor, the "time traveller from 2036" who said he came back for a 5100 ----
    case "TITOR":
    case "JOHN TITOR":
    case "TIMETRAVEL_0":
      return {
        effect: "glitch",
        lines: [
          "> SIGNAL ACQUIRED. ORIGIN TIMESTAMP: 2036",
          "> HANDLE ........ TIMETRAVEL_0",
          "> MISSION ....... RETRIEVE ONE IBM 5100, CIRCA 1975",
          "> REASON ........ IT READS CODE THE MAINFRAMES FORGOT",
          "> STOPOVER ...... YEAR 2000. PERSONAL REASONS.",
          "> NOTE .......... THIS IS ONLY ONE WORLD LINE OF MANY.",
          "> SIGNAL LOST.",
          "  (A TAPE WAS LEFT IN THE DRIVE. TRY DIR.)",
        ],
      };
    case "C204":
    case "TIME MACHINE":
      return {
        lines: [
          "C204 GRAVITY DISTORTION TIME DISPLACEMENT UNIT",
          "  MANUFACTURER ...... GENERAL ELECTRIC (PER SOURCE)",
          "  DRIVE ............. 2 x KERR MICRO SINGULARITY",
          "  TIMING ............ 3 x CESIUM CLOCK",
          "  STATUS ............ NOT FOUND ON THIS WORLD LINE",
        ],
      };
    case "2036":
      return {
        effect: "divergence",
        lines: ["YEAR 2036 IS NOT REACHABLE FROM THIS UNIT.", "  REQUIRED: C204. INSTALLED: NONE.", "  THE 5100 WAITS. IT IS GOOD AT WAITING."],
      };
    case "2038":
    case "Y2K38":
    case "Y2038":
      return { lines: y2038Countdown() };
    case "UNDOCUMENTED":
    case "HIDDEN":
    case "DEBUG":
      return {
        effect: "static",
        lines: [
          "UNDOCUMENTED FEATURE REPORT",
          "  THE REAL 5100 RAN ITS BASIC AND APL ON TOP OF",
          "  EMULATED IBM MAINFRAME MICROCODE. A DESKTOP",
          "  THAT COULD READ BIG-IRON CODE.",
          "  ACCESS LEVEL REQUIRED ..... 2036",
          "  ACCESS LEVEL PRESENT ...... 1975",
        ],
      };
    case "SUZUHA":
    case "AMANE SUZUHA":
      return {
        effect: "glitch",
        lines: ["> JOHN TITOR WAS A NAME. NOTHING MORE.", "> THE MACHINE IS STILL ON THE ROOF.", "> - A PART-TIMER FROM 2036"],
      };
    case "EL PSY KONGROO":
    case "EL PSY CONGROO":
      return {
        effect: "glitch",
        lines: [
          "",
          "> INCOMING TRANSMISSION ......",
          "> IT IS ALL ACCORDING TO THE CHOICE",
          "> OF STEINS;GATE.",
          "> EL PSY KONGROO.",
          "",
        ],
      };
    case "IBN":
    case "IBN5100":
    case "IBN 5100":
      return {
        lines: [
          "?IBN 5100 NOT FOUND",
          " THIS UNIT IDENTIFIES AS AN IBM 5100.",
          " THE IBN 5100 EXISTS ON ANOTHER WORLD LINE.",
          " CHECK THE SHRINE.",
        ],
      };
    case "SERN":
      return {
        effect: "static",
        lines: [
          "WARNING: OUTBOUND CONNECTION DETECTED",
          "  ROUTE ... ECHELON ... SERN/GENEVA",
          "  THIS TERMINAL IS BEING WATCHED.",
          "CONNECTION SEVERED.",
        ],
      };
    case "DIVERGENCE":
    case "WORLDLINE":
    case "WORLD LINE": {
      const value = Math.random() < 0.7 ? WORLD_LINES[0] : WORLD_LINES[1 + Math.floor(Math.random() * 4)];
      return {
        effect: "divergence",
        lines: ["DIVERGENCE METER READING:", "", ...bigNumber(value), "", value === "1.048596" ? "  STEINS;GATE WORLD LINE." : "  ATTRACTOR FIELD SHIFT DETECTED."],
      };
    }
    case "TUTURU":
    case "TUTTURU":
      return { lines: ["TUTTURU~  MAYUSHII DESU.", "OKARIN, DON'T FORGET TO EAT LUNCH~"] };
    case "DMAIL":
    case "D-MAIL":
    case "D MAIL":
      return {
        effect: "glitch",
        lines: [
          "PHONE MICROWAVE (NAME SUBJECT TO CHANGE)",
          "  LIFTER CHARGE ...... 0%",
          "?D-MAIL NOT SENT: LIFTER OFFLINE",
        ],
      };
    case "OPERATION SKULD":
      return {
        effect: "divergence",
        lines: [
          "OPERATION SKULD: INITIATED",
          "  TARGET WORLD LINE .... 1.048596",
          "  MISSION ............. SAVE KURISU",
          "  STATUS .............. IN PROGRESS",
          "GOOD LUCK, LAB MEMBER 001.",
        ],
      };
    case "FUTURE GADGET":
    case "LAB":
      return {
        lines: [
          "FUTURE GADGET LABORATORY - MEMBER LIST",
          "  001 HOUOIN KYOMA     002 SHIINA MAYURI",
          "  003 HASHIDA ITARU    004 MAKISE KURISU",
          "  ...",
        ],
      };
  }
  return null;
}

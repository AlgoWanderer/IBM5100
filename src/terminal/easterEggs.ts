// Hidden words for Steins;Gate fans. Checked before BASIC sees the line.
import type { PictureName } from "./pictures.gen";

export type MachineEffect = "glitch" | "divergence" | "static" | "tape" | "check";

export interface EggResult {
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

/** Collapses spacing and trailing ! or . so "EL PSY KONGROO." still matches. */
export function normalizeEggInput(input: string): string {
  return input.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
}

/** One spelling of every secret; aliases of the same secret are not listed twice. */
const EGG_COMMANDS = [
  "TITOR", "C204", "2036", "2038", "UNDOCUMENTED", "SUZUHA", "EL PSY KONGROO", "IBN",
  "SERN", "DIVERGENCE", "TUTURU", "DMAIL", "OPERATION SKULD", "LAB", "OKABE", "KURISU",
  "CHRISTINA", "ZOMBIE", "ASSISTANT",
];

/**
 * Which secret a result belongs to: its first non-blank line, which is the
 * same for every alias (and fixed even for the random/countdown ones).
 */
export function eggId(egg: EggResult): string {
  return egg.lines.find((l) => l.trim()) ?? "";
}

/** The secrets that count toward 100%. */
export const EGG_IDS = new Set(EGG_COMMANDS.map((c) => eggId(checkEasterEgg(c)!)));
export const EGG_TOTAL = EGG_IDS.size;

/** A picture the 5100 reads off tape and scans onto the screen. */
export interface PictureEgg {
  picture: PictureName;
  /** File name shown while the tape searches. */
  tape: string;
  /** Text printed under the picture once it is in. */
  caption: string[];
}

const LAB_PHOTO: PictureEgg = {
  picture: "labphoto",
  tape: "LABPHOTO",
  caption: [
    "OMEDETOU! EVERY LAB MEMBER, ON WORLD LINE 1.048596.",
    "THANK YOU FOR STAYING UNTIL THE END. - FUTURE GADGET LAB",
  ],
};

const PICTURE_EGGS: Record<string, PictureEgg> = {
  // wholesome words for the Steins;Gate 100% picture
  "THANK YOU": LAB_PHOTO, THANKYOU: LAB_PHOTO, THANKS: LAB_PHOTO, ARIGATOU: LAB_PHOTO, ARIGATO: LAB_PHOTO,
  OMEDETOU: LAB_PHOTO, OMEDETO: LAB_PHOTO, CONGRATULATIONS: LAB_PHOTO, CONGRATS: LAB_PHOTO,

  // John Titor's forum attachments
  "PHOTO 1": {
    picture: "laser",
    tape: "ATTACH01",
    caption: ["PHOTO 1: A LASER BEAM BENDING NEAR THE UNIT'S GRAVITY FIELD.", "  (AS DESCRIBED BY TIMETRAVEL_0.)"],
  },
  "PHOTO 2": {
    picture: "unit",
    tape: "ATTACH02",
    caption: ["PHOTO 2: THE C204 UNIT, MOUNTED IN THE BACK OF HIS CAR.", "  NOTE THE HAZARD STRIPES. COMPARE: BLUEPRINT."],
  },
  "PHOTO 3": {
    picture: "remote",
    tape: "ATTACH03",
    caption: ["PHOTO 3: UNIT POWERED UP. THE BOX ON THE SEAT WITH THE COILED", "  CORD IS THE REMOTE CONTROL UNIT (ITEM 3, SEE DIAGRAM)."],
  },
  BLUEPRINT: {
    picture: "blueprint",
    tape: "C204-SYS",
    caption: ["MAJOR SYSTEMS DESCRIPTION - ARMY MODEL GE / C204", "  RESTRICTED. FILE: TMIM-2006/4005"],
  },
  DIAGRAM: {
    picture: "diagram",
    tape: "C204-UNIT",
    caption: [
      "C204 UNIT LAYOUT",
      "  1 MAIN SINGULARITY         6 MAIN UNIT ON/OFF SWITCH",
      "  2 STEERING SINGULARITY     7 UNIT CONTROL INSTRUCTIONS",
      "  3 REMOTE CONTROL UNIT      8 EMERGENCY CONTROLS",
      "  4 EMERGENCY VIEW SCREEN    9 REMOTE STORAGE UNIT",
      "  5 EMERGENCY DISCONNECT",
    ],
  },
};
for (const [alias, name] of [
  ["PHOTO1", "PHOTO 1"], ["PHOTO2", "PHOTO 2"], ["PHOTO3", "PHOTO 3"],
  ["SCHEMATIC", "BLUEPRINT"], ["SCHEMATICS", "BLUEPRINT"], ["BLUEPRINTS", "BLUEPRINT"],
] as const) PICTURE_EGGS[alias] = PICTURE_EGGS[name];

export function checkPictureEgg(input: string): PictureEgg | null {
  return PICTURE_EGGS[normalizeEggInput(input)] ?? null;
}

export function checkEasterEgg(input: string): EggResult | null {
  const w = normalizeEggInput(input);
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
          "  (HE LEFT PHOTOS TOO. TRY PHOTOS.)",
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
          "  DRAWINGS ON TAPE .. BLUEPRINT, DIAGRAM",
        ],
      };
    case "PHOTOS":
    case "PICTURES":
    case "ATTACHMENTS":
    case "EVIDENCE":
    case "TITOR PHOTOS":
      return {
        lines: [
          "TIMETRAVEL_0 // ATTACHMENTS, POSTED ONLINE 2000-2001",
          "  PHOTO 1 ...... LASER TEST",
          "  PHOTO 2 ...... THE UNIT, INSTALLED",
          "  PHOTO 3 ...... THE UNIT, POWERED",
          "  BLUEPRINT .... C204 MAJOR SYSTEMS",
          "  DIAGRAM ...... C204 UNIT LAYOUT",
          "TYPE A NAME TO LOAD IT FROM TAPE.",
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
          "  005 KIRYU MOEKA      006 URUSHIBARA RUKA",
          "  007 FEYRIS NYANNYAN  008 AMANE SUZUHA",
        ],
      };

    // ---- Okabe Rintarou, self-styled mad scientist ----
    case "OKABE":
    case "OKABE RINTAROU":
    case "OKABE RINTARO":
    case "RINTAROU":
    case "RINTARO":
    case "OKARIN":
    case "KYOMA":
    case "KYOUMA":
    case "HOUOIN KYOMA":
    case "HOUOIN KYOUMA":
    case "HOUOUIN KYOUMA":
      return {
        effect: "glitch",
        lines: [
          "> I AM MAD SCIENTIST, HOUOIN KYOUMA!",
          "  TRUE NAME ...... OKABE RINTAROU",
          "  LAB MEMBER ..... 001",
          "  AFFILIATION .... FUTURE GADGET LABORATORY",
          "  RANK ........... FOUNDER / MAD SCIENTIST",
          "  KNOWN ALSO AS .. OKARIN (BY 002, 004)",
          "",
          "> THE ORGANISATION IS WATCHING. MUHAHAHA!",
          "> THIS IS THE CHOICE OF STEINS;GATE. EL PSY KONGROO.",
        ],
      };

    // ---- Makise Kurisu and the pile of names Okabe gives her ----
    case "KURISU":
    case "MAKISE":
    case "MAKISE KURISU":
      return {
        effect: "check",
        lines: [
          "MAKISE KURISU - ALIASES ON RECORD",
          "  LAB MEMBER ........... 004",
          "  CHRISTINA ............ (OKABE, WILL NOT STOP)",
          "  THE ZOMBIE ........... (OKABE)",
          "  CELEB SEVENTEEN ...... (POSTED AS, ON @CHANNEL)",
          "  ASSISTANT ............ (OKABE)",
          "  PERVERTED GENIUS GIRL  (OKABE, DISPUTED)",
          "  AMERICAN VIRGIN ...... (DARU)",
          "",
          "  SHE IS NEUROSCIENCE. SHE IS NOT A ZOMBIE.",
          "  \"IT'S NOT LIKE I LIKE YOU OR ANYTHING.\"",
        ],
      };
    case "CHRISTINA":
    case "CHRISTINAAA":
      return {
        effect: "glitch",
        lines: [
          "> STOP CALLING ME CHRISTINA!",
          "  MY NAME IS MAKISE KURISU.",
          "  (REF: KURISU)",
        ],
      };
    case "ZOMBIE":
    case "THE ZOMBIE":
      return { lines: ["THE ZOMBIE IS NOT A ZOMBIE.", "  SEE: KURISU, LAB MEMBER 004."] };
    case "CELEB SEVENTEEN":
    case "ASSISTANT":
      return { lines: ["ALIAS RESOLVED -> MAKISE KURISU (004).", "  TRY: KURISU"] };
  }
  return null;
}

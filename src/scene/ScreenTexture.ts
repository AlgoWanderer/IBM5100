import * as THREE from "three";
import { COLS, ROWS, type Machine } from "../terminal/Machine";
import { PICTURES, type PictureName } from "../terminal/pictures.gen";

export type DisplayMode = "64" | "L32" | "R32";

// The 5100's built-in CRT face is ~1.31:1. Keep the canvas at that ratio.
const W = 1536;
const H = 1172;
const MARGIN_X = 70;
const MARGIN_Y = 64;

const PHOSPHOR = "#dcf3d2";
const PHOSPHOR_GLOW = "rgba(150, 255, 170, 0.55)";
const BG = "#060908";

/** Which dots of a 1-bit picture are lit, row by row. */
async function loadDots(name: PictureName): Promise<Uint8Array> {
  const { w, h } = PICTURES[name];
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}images/${name}.png`;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const dots = new Uint8Array(w * h);
  for (let i = 0; i < dots.length; i++) dots[i] = px[i * 4] > 127 ? 1 : 0;
  return dots;
}

/**
 * Draws the Machine's character grid onto a canvas that is used as a texture
 * on the model's CRT face. Only redraws when the machine (or cursor) changes.
 */
export class ScreenRenderer {
  private canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private lastKey = "";
  private fontReady = false;
  private dots: Partial<Record<PictureName, Uint8Array>> = {};
  private loading = new Set<PictureName>();

  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.flipY = true;
    document.fonts.load("64px VT323").then(() => {
      this.fontReady = true;
      this.lastKey = "";
    });
  }

  update(m: Machine, mode: DisplayMode, reverse: boolean, timeMs: number, powered: boolean) {
    const cursorOn = m.acceptsTyping && Math.floor(timeMs / 530) % 2 === 0;
    const pic = m.picture?.name;
    if (pic && !this.dots[pic] && !this.loading.has(pic)) {
      this.loading.add(pic);
      loadDots(pic)
        .then((d) => { this.dots[pic] = d; this.lastKey = ""; })
        .catch(() => this.loading.delete(pic));
    }
    const key = `${m.version}|${mode}|${reverse}|${cursorOn}|${powered}|${this.fontReady}|${pic && !!this.dots[pic]}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.draw(m, mode, reverse, cursorOn, powered);
    this.texture.needsUpdate = true;
  }

  private draw(m: Machine, mode: DisplayMode, reverse: boolean, cursorOn: boolean, powered: boolean) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    if (!powered) return;

    const fg = reverse ? BG : PHOSPHOR;
    if (reverse) {
      ctx.fillStyle = PHOSPHOR;
      ctx.fillRect(MARGIN_X * 0.6, MARGIN_Y * 0.6, W - MARGIN_X * 1.2, H - MARGIN_Y * 1.2);
    }

    const visibleCols = mode === "64" ? COLS : COLS / 2;
    const firstCol = mode === "R32" ? COLS / 2 : 0;
    const cw = (W - MARGIN_X * 2) / visibleCols;
    const ch = (H - MARGIN_Y * 2) / ROWS;
    const fontPx = Math.round(ch * 1.02);

    ctx.font = `${fontPx}px VT323, "Courier New", monospace`;
    ctx.textBaseline = "middle";
    // squeeze/stretch each glyph to exactly one character cell
    const sx = cw / (ctx.measureText("M").width || fontPx * 0.5);

    ctx.fillStyle = fg;
    ctx.shadowColor = reverse ? "transparent" : PHOSPHOR_GLOW;
    ctx.shadowBlur = reverse ? 0 : 14;

    if (m.picture && this.dots[m.picture.name]) this.drawPicture(m.picture.name, m.picture.top, m.picture.shown, ch, reverse);

    for (let r = 0; r < ROWS; r++) {
      const y = MARGIN_Y + ch * (r + 0.55);
      const rowCells = m.grid[r];
      ctx.save();
      ctx.translate(MARGIN_X, y);
      ctx.scale(sx, 1);
      for (let c = 0; c < visibleCols; c++) {
        const glyph = rowCells[firstCol + c];
        if (glyph === " ") continue;
        if (glyph === "█") {
          ctx.fillRect((c * cw) / sx, -ch * 0.46, cw / sx, ch * 0.92);
        } else {
          ctx.fillText(glyph, (c * cw) / sx, 0);
        }
      }
      ctx.restore();
    }

    // block cursor
    const cc = m.col - firstCol;
    if (cursorOn && cc >= 0 && cc < visibleCols) {
      ctx.globalAlpha = 0.85;
      ctx.fillRect(MARGIN_X + cc * cw, MARGIN_Y + ch * (m.row + 0.08), cw * 0.92, ch * 0.9);
      ctx.globalAlpha = 1;
    }

    // the 5100's own little CRT has visible raster lines
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    const lineGap = ch / 6;
    for (let y = 0; y < H; y += lineGap) ctx.fillRect(0, y, W, lineGap * 0.35);
    ctx.globalCompositeOperation = "source-over";
  }

  private sprites = new Map<string, HTMLCanvasElement>();

  /** A picture as phosphor dots with a small gap between them, drawn once. */
  private sprite(name: PictureName, pitch: number, reverse: boolean): HTMLCanvasElement {
    const key = `${name}|${reverse}`;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const { w, h } = PICTURES[name];
    const dots = this.dots[name]!;
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * pitch);
    c.height = Math.ceil(h * pitch);
    const g = c.getContext("2d")!;
    g.fillStyle = reverse ? BG : PHOSPHOR;
    const size = pitch * 0.8;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (dots[y * w + x]) g.fillRect(x * pitch, y * pitch, size, size);
    this.sprites.set(key, c);
    return c;
  }

  /**
   * Draws the first `shown` dot rows of a picture, as if the 5100 were
   * scanning it in, with a bright scan line while it is still arriving.
   */
  private drawPicture(name: PictureName, topRow: number, shown: number, ch: number, reverse: boolean) {
    const { h, rows } = PICTURES[name];
    const ctx = this.ctx;
    const pitch = (rows * ch) / h;
    const sprite = this.sprite(name, pitch, reverse);
    const x0 = Math.round((W - sprite.width) / 2);
    const y0 = Math.round(MARGIN_Y + topRow * ch);
    const sh = Math.min(sprite.height, Math.round(shown * pitch));
    if (sh <= 0) return;
    ctx.save();
    ctx.shadowBlur = reverse ? 0 : 8;
    ctx.drawImage(sprite, 0, 0, sprite.width, sh, x0, y0, sprite.width, sh);
    if (shown < h) {
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x0, y0 + sh, sprite.width, pitch * 0.7);
    }
    ctx.restore();
  }
}

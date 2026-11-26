// news-image-20261125: draws one image summing up the world news of
// Wednesday 25 November 2026 as a newspaper front page.
// Pure Node 22 stdlib. No network, no randomness, no clock: the same
// bytes come out of every run.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

// ---------------- CRC32 ----------------
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------- PNG encoder ----------------
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter none
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------- 5x7 bitmap font ----------------
// Each glyph is 7 rows of 5 bits, "#" = on.
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
};

// ---------------- Canvas ----------------
type RGB = [number, number, number];
const PAPER: RGB = [246, 241, 229];
const INK: RGB = [26, 26, 26];
const NAVY: RGB = [20, 33, 61];
const CREAM: RGB = [246, 241, 229];
const RED: RGB = [185, 28, 28];
const AMBER: RGB = [217, 119, 6];
const TEAL: RGB = [14, 116, 144];
const BLUE: RGB = [29, 78, 216];
const SEA: RGB = [13, 59, 78];
const SKY1: RGB = [232, 131, 58];
const SKY2: RGB = [242, 166, 90];
const SKY3: RGB = [247, 200, 115];
const WHITE: RGB = [255, 255, 255];
const HULL: RGB = [24, 24, 28];
const FLAME_OUT: RGB = [230, 60, 14];
const FLAME_MID: RGB = [255, 140, 26];
const FLAME_IN: RGB = [255, 221, 51];
const SMOKE: RGB = [90, 90, 92];
const SMOKE_L: RGB = [130, 130, 132];

class Canvas {
  w: number;
  h: number;
  data: Buffer;
  constructor(w: number, h: number, bg: RGB) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 3);
    this.fillRect(0, 0, w, h, bg);
  }
  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
    this.fillRect(x, y, w, t, c);
    this.fillRect(x, y + h - t, w, t, c);
    this.fillRect(x, y, t, h, c);
    this.fillRect(x + w - t, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      for (let xx = cx - dx; xx <= cx + dx; xx++) this.set(xx, cy + dy, c);
    }
  }
  polygon(pts: [number, number][], c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.set(x, y, c);
      }
    }
  }
  text(x: number, y: number, s: string, scale: number, c: RGB): void {
    const up = s.toUpperCase();
    for (let i = 0; i < up.length; i++) {
      const g = FONT[up[i]] || FONT[" "];
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 5; col++)
          if (g[row][col] === "1")
            this.fillRect(x + i * 6 * scale + col * scale, y + row * scale, scale, scale, c);
    }
  }
  textWidth(s: string, scale: number): number {
    return s.length * 6 * scale;
  }
  textCentered(cx: number, y: number, s: string, scale: number, c: RGB): void {
    this.text(cx - Math.floor(this.textWidth(s, scale) / 2), y, s, scale, c);
  }
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + (cur ? " " : "") + w).length <= maxChars) {
      cur += (cur ? " " : "") + w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------- The front page ----------------
function drawPage(): Canvas {
  const cv = new Canvas(1024, 1024, PAPER);
  cv.rect(4, 4, 1016, 1016, INK, 3);

  // Masthead
  cv.fillRect(8, 8, 1008, 88, NAVY);
  cv.textCentered(512, 26, "THE WORLD IN ONE IMAGE", 5, CREAM);
  cv.fillRect(8, 96, 1008, 4, RED);

  // Date strip
  cv.textCentered(512, 108, "WEDNESDAY, 25 NOVEMBER 2026", 3, RED);

  // Kicker + headline + subhead
  cv.textCentered(512, 140, "STRAIT OF HORMUZ - THE DAY'S TOP STORY", 2, RED);
  cv.textCentered(512, 162, "TWO TANKERS STRUCK BY MINES", 4, INK);
  cv.textCentered(512, 192, "ABLAZE IN THE STRAIT OF HORMUZ", 4, INK);
  cv.textCentered(512, 226, "IRGC SAYS THE SHIPS HIT NAVAL MINES AND CAUGHT FIRE", 2, INK);
  cv.textCentered(512, 244, "AS THEY CROSSED THE STRAIT; OIL BURNS ON THE WATER.", 2, INK);

  // --- Main art: burning tankers at dusk, 262..556 ---
  const artY = 262;
  const artH = 294;
  const horizon = artY + 128;
  cv.fillRect(16, artY, 992, 48, SKY1);
  cv.fillRect(16, artY + 48, 992, 40, SKY2);
  cv.fillRect(16, artY + 88, 992, 40, SKY3);
  cv.fillRect(16, horizon, 992, artH - 128, SEA);
  cv.fillRect(16, horizon, 992, 3, CREAM);

  // Smoke columns rise straight from the flame tips
  cv.circle(345, artY + 78, 26, SMOKE);
  cv.circle(340, artY + 50, 20, SMOKE_L);
  cv.circle(348, artY + 26, 14, SMOKE);
  cv.circle(748, artY + 84, 20, SMOKE);
  cv.circle(744, artY + 60, 15, SMOKE_L);
  cv.circle(752, artY + 38, 10, SMOKE);

  // Tanker 1 (left, near): hull, bridge, funnel, flames
  const t1x = 180;
  const t1y = horizon + 58; // deck line
  cv.polygon(
    [
      [t1x, t1y],
      [t1x + 300, t1y],
      [t1x + 282, t1y + 44],
      [t1x + 16, t1y + 44],
    ],
    HULL
  );
  cv.fillRect(t1x + 36, t1y - 34, 52, 34, HULL);
  cv.fillRect(t1x + 96, t1y - 22, 26, 22, HULL);
  cv.fillRect(t1x + 250, t1y - 30, 18, 30, RED);
  // flames on tanker 1
  cv.polygon(
    [
      [t1x + 130, t1y],
      [t1x + 165, t1y - 92],
      [t1x + 200, t1y],
    ],
    FLAME_OUT
  );
  cv.polygon(
    [
      [t1x + 142, t1y],
      [t1x + 165, t1y - 66],
      [t1x + 188, t1y],
    ],
    FLAME_MID
  );
  cv.polygon(
    [
      [t1x + 154, t1y],
      [t1x + 165, t1y - 42],
      [t1x + 176, t1y],
    ],
    FLAME_IN
  );
  cv.polygon(
    [
      [t1x + 205, t1y],
      [t1x + 228, t1y - 58],
      [t1x + 250, t1y],
    ],
    FLAME_MID
  );

  // Tanker 2 (right, farther, smaller)
  const t2x = 640;
  const t2y = horizon + 34;
  cv.polygon(
    [
      [t2x, t2y],
      [t2x + 210, t2y],
      [t2x + 196, t2y + 32],
      [t2x + 12, t2y + 32],
    ],
    HULL
  );
  cv.fillRect(t2x + 24, t2y - 24, 36, 24, HULL);
  cv.fillRect(t2x + 168, t2y - 20, 14, 20, RED);
  cv.polygon(
    [
      [t2x + 80, t2y],
      [t2x + 108, t2y - 62],
      [t2x + 136, t2y],
    ],
    FLAME_OUT
  );
  cv.polygon(
    [
      [t2x + 92, t2y],
      [t2x + 108, t2y - 40],
      [t2x + 124, t2y],
    ],
    FLAME_IN
  );

  // Naval mines in the foreground water
  for (const [mx, my] of [
    [120, 520],
    [880, 512],
  ] as [number, number][]) {
    cv.circle(mx, my, 12, INK);
    for (let a = 0; a < 8; a++) {
      const ang = (a * Math.PI) / 4;
      cv.line(
        mx + Math.round(Math.cos(ang) * 12),
        my + Math.round(Math.sin(ang) * 12),
        mx + Math.round(Math.cos(ang) * 20),
        my + Math.round(Math.sin(ang) * 20),
        INK
      );
    }
  }
  // Wave strokes
  for (const [wx, wy, wl] of [
    [80, 480, 70],
    [420, 500, 90],
    [600, 486, 60],
    [820, 470, 80],
    [240, 536, 80],
    [520, 530, 70],
    [760, 536, 90],
  ] as [number, number, number][]) {
    cv.fillRect(wx, wy, wl, 3, CREAM);
  }

  // --- Four story boxes, 2x2 ---
  const boxes: { label: string; color: RGB; body: string }[] = [
    {
      label: "TARIFFS",
      color: BLUE,
      body: "US proposes new tariffs on 14 trading partners after an 8-month probe. China 20%, Vietnam up to 35%.",
    },
    {
      label: "MARKETS",
      color: RED,
      body: "Asia chip rout: KOSPI -6.2%, Samsung -9.9%, SK Hynix -11.1%. Nasdaq -1.5%; Dow tops 50,000.",
    },
    {
      label: "RIYADH",
      color: AMBER,
      body: "Houthi drone hits a tower in Riyadh's financial district. 11 people injured; refinery also attacked.",
    },
    {
      label: "SPACE",
      color: TEAL,
      body: "Shenzhou-24 docks with Tiangong space station. Pakistan's first astronaut reaches orbit.",
    },
  ];
  const boxW = 484;
  const boxH = 164;
  const boxXs = [20, 520];
  const boxYs = [574, 750];
  boxes.forEach((b, i) => {
    const bx = boxXs[i % 2];
    const by = boxYs[Math.floor(i / 2)];
    cv.fillRect(bx, by, boxW, boxH, WHITE);
    cv.rect(bx, by, boxW, boxH, INK, 2);
    cv.fillRect(bx + 2, by + 2, boxW - 4, 30, b.color);
    cv.text(bx + 14, by + 10, b.label, 2, WHITE);
    const lines = wrap(b.body, 36);
    lines.forEach((ln, li) => cv.text(bx + 14, by + 46 + li * 20, ln, 2, INK));
  });

  // --- Footer ticker ---
  cv.fillRect(16, 926, 992, 82, NAVY);
  cv.textCentered(
    512,
    940,
    "GAZA: ISRAEL KILLS HAMAS SECURITY CHIEF ABUELOUF, WIFE AND 2 CHILDREN",
    2,
    CREAM
  );
  cv.textCentered(
    512,
    968,
    "CHESS: GUKESH-SINDAROV DRAW 1-1 - HUAWEI CONVICTED ON 10 OF 12 COUNTS",
    2,
    CREAM
  );

  return cv;
}

// ---------------- Run ----------------
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "out";
fs.mkdirSync(outDir, { recursive: true });
const page = drawPage();
const png = encodePng(page.w, page.h, page.data);
fs.writeFileSync(path.join(outDir, "entry.png"), png);
console.log(`wrote ${path.join(outDir, "entry.png")} (${png.length} bytes)`);

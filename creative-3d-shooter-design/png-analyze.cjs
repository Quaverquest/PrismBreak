const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

function decodePNG(buf) {
  let pos = 8;
  let w = 0,
    h = 0,
    depth = 0,
    ctype = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      depth = data[8];
      ctype = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ctype === 6 ? 4 : ctype === 2 ? 3 : ctype === 4 ? 2 : 1;
  const bpp = ch * (depth / 8);
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = raw.subarray(p, p + stride);
    p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c),
          pb = Math.abs(a - c),
          pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

const targets = [
  ["cyan", [37, 230, 255]],
  ["magenta", [255, 47, 158]],
  ["amber", [255, 176, 32]],
  ["lime", [166, 255, 61]],
  ["white", [255, 255, 255]],
];

function analyze(file) {
  const img = decodePNG(fs.readFileSync(file));
  const { w, h, ch, data } = img;
  let sum = 0,
    bright = 0,
    mid = 0,
    dark = 0,
    sat = 0;
  const counts = Object.fromEntries(targets.map((t) => [t[0], 0]));
  const hueHist = new Array(12).fill(0);
  const n = w * h;
  const step = 1;
  let samples = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * ch;
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      samples++;
      const l = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      sum += l;
      if (l > 0.55) bright++;
      else if (l > 0.16) mid++;
      else dark++;
      const mx = Math.max(r, g, b),
        mn = Math.min(r, g, b);
      const s = mx === 0 ? 0 : (mx - mn) / mx;
      if (s > 0.45 && mx > 60) {
        sat++;
        let hh = 0;
        if (mx !== mn) {
          const d = mx - mn;
          hh =
            mx === r
              ? ((g - b) / d + (g < b ? 6 : 0)) * 60
              : mx === g
                ? ((b - r) / d + 2) * 60
                : ((r - g) / d + 4) * 60;
        }
        hueHist[Math.min(11, Math.floor(hh / 30))]++;
      }
      for (const [name, t] of targets) {
        if (Math.abs(r - t[0]) < 46 && Math.abs(g - t[1]) < 46 && Math.abs(b - t[2]) < 46) {
          counts[name]++;
          break;
        }
      }
    }
  }
  // region brightness: thirds
  const region = (x0, y0, x1, y1) => {
    let s = 0,
      c = 0;
    for (let y = Math.floor(h * y0); y < h * y1; y += 2)
      for (let x = Math.floor(w * x0); x < w * x1; x += 2) {
        const i = (y * w + x) * ch;
        s += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        c++;
      }
    return c ? +(s / c).toFixed(3) : 0;
  };

  return {
    file: path.basename(file),
    size: `${w}x${h}`,
    meanLuma: +(sum / samples).toFixed(3),
    pctBright: +((bright / samples) * 100).toFixed(1),
    pctMid: +((mid / samples) * 100).toFixed(1),
    pctDark: +((dark / samples) * 100).toFixed(1),
    pctSaturated: +((sat / samples) * 100).toFixed(1),
    hues: hueHist.map((v, i) => `${i * 30}-${i * 30 + 30}:${((v / samples) * 100).toFixed(1)}%`),
    colors: Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, +((v / samples) * 100).toFixed(2)]),
    ),
    regions: {
      topLeft: region(0, 0, 0.33, 0.33),
      topRight: region(0.67, 0, 1, 0.33),
      center: region(0.33, 0.33, 0.67, 0.67),
      bottomCenter: region(0.33, 0.67, 0.67, 1),
      bottomLeft: region(0, 0.67, 0.33, 1),
    },
  };
}

for (const f of process.argv.slice(2)) console.log(JSON.stringify(analyze(f), null, 1));

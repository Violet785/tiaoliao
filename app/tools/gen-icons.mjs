/**
 * 生成 PWA 图标。
 *
 *   node tools/gen-icons.mjs
 *
 * 为什么要写脚本而不是直接放三张 PNG 进仓库：
 * 图标要改配色、换字号、调圆角时，重跑一次即可，不用打开设计软件。
 * 字体用系统的黑体（笔画厚重，小尺寸下比宋体清晰得多）。
 *
 * 自己实现 PNG 编码和字形栅格化，是为了不引入 sharp/canvas 这类原生依赖 ——
 * 和整个项目「零原生依赖」的路线一致。
 */
import opentype from 'opentype.js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync, crc32 as zlibCrc32 } from 'node:zlib'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = resolve(HERE, '../src/static/icons')

const FONT_PATH = 'C:\\Windows\\Fonts\\simhei.ttf'
const GLYPH = '蘸'
const BG = [0xC8, 0x45, 0x2E]      // 与 App.vue 里的 --c-primary 一致
const FG = [0xFF, 0xFF, 0xFF]
const SS = 3                        // 超采样倍数，用来做抗锯齿

/*
 * opentype 2.x 里的 loadSync 已经是个空壳（只打一行废弃警告就返回 undefined），
 * 得自己读文件再交给 parse。
 * 提到模块级只解析一次 —— 9.3MB 的中文字体解析四遍纯属浪费。
 */
const FONT_BUF = readFileSync(FONT_PATH)
const FONT = opentype.parse(
  FONT_BUF.buffer.slice(FONT_BUF.byteOffset, FONT_BUF.byteOffset + FONT_BUF.byteLength),
)

/* ---------------- PNG 编码 ---------------- */

// Node 20.15+ 自带 zlib.crc32；低版本走手写兜底，免得脚本在别人机器上跑不起来
const crc32 = zlibCrc32 ?? (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return (buf) => {
    let c = 0xFFFFFFFF
    for (const b of buf) c = table[(c ^ b) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
})()

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([len, body, crc])
}

/** rgba: Buffer，长度 w*h*4 */
function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8    // 位深
  ihdr[9] = 6    // 颜色类型 6 = RGBA
  // 10/11/12 保持 0：压缩/滤波/隔行方式均用默认值

  // 每行前面加一个 filter 字节（0 = 无滤波），这是 PNG 的规定格式
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 4)
    raw[o] = 0
    rgba.copy(raw, o + 1, y * w * 4, (y + 1) * w * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- 字形栅格化 ---------------- */

/** 把 opentype 的路径命令拍平成多边形，顺便做缩放平移 */
function flatten(commands, { scale, dx, dy }) {
  const polys = []
  let cur = null
  let x = 0
  let y = 0

  const tx = (px) => px * scale + dx
  const ty = (py) => py * scale + dy
  const push = (px, py) => cur.push([tx(px), ty(py)])

  for (const c of commands) {
    if (c.type === 'M') {
      if (cur?.length) polys.push(cur)
      cur = []
      push(c.x, c.y)
      x = c.x; y = c.y
    } else if (c.type === 'L') {
      push(c.x, c.y)
      x = c.x; y = c.y
    } else if (c.type === 'C') {
      // 三次贝塞尔 —— 采样成折线。16 段在图标尺寸下肉眼看不出棱角
      for (let i = 1; i <= 16; i++) {
        const t = i / 16, mt = 1 - t
        push(
          mt * mt * mt * x + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t * t * t * c.x,
          mt * mt * mt * y + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t * t * t * c.y,
        )
      }
      x = c.x; y = c.y
    } else if (c.type === 'Q') {
      for (let i = 1; i <= 12; i++) {
        const t = i / 12, mt = 1 - t
        push(mt * mt * x + 2 * mt * t * c.x1 + t * t * c.x, mt * mt * y + 2 * mt * t * c.y1 + t * t * c.y)
      }
      x = c.x; y = c.y
    } else if (c.type === 'Z') {
      if (cur?.length) {
        cur.push([...cur[0]])
        polys.push(cur)
        cur = null
      }
    }
  }
  if (cur?.length) polys.push(cur)
  return polys
}

/**
 * 多边形扫描线填充，用非零环绕规则。
 *
 * 必须用非零而不是奇偶 —— 汉字笔画密集，还有「日」这类封闭内框，
 * 奇偶规则会把重叠笔画挖空。
 */
function fillNonZero(polys, W, H, out) {
  for (let py = 0; py < H; py++) {
    const sy = py + 0.5
    const crossings = []

    for (const poly of polys) {
      for (let i = 0; i < poly.length - 1; i++) {
        const [x1, y1] = poly[i]
        const [x2, y2] = poly[i + 1]
        if (y1 === y2) continue
        const ymin = y1 < y2 ? y1 : y2
        const ymax = y1 < y2 ? y2 : y1
        if (sy < ymin || sy >= ymax) continue
        crossings.push({ x: x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1), dir: y2 > y1 ? 1 : -1 })
      }
    }
    if (crossings.length < 2) continue
    crossings.sort((a, b) => a.x - b.x)

    let w = 0
    for (let i = 0; i < crossings.length - 1; i++) {
      w += crossings[i].dir
      if (w === 0) continue
      const a = Math.max(0, Math.round(crossings[i].x))
      const b = Math.min(W, Math.round(crossings[i + 1].x))
      const row = py * W
      for (let px = a; px < b; px++) out[row + px] = 1
    }
  }
}

/** 圆角矩形，返回 [x,y] 多边形（含圆角采样点） */
function roundRectPath(x, y, w, h, r, steps = 10) {
  const pts = []
  const arc = (cx, cy, from, to) => {
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
    }
  }
  arc(x + w - r, y + h - r, 0, Math.PI / 2)
  arc(x + r, y + h - r, Math.PI / 2, Math.PI)
  arc(x + r, y + r, Math.PI, Math.PI * 1.5)
  arc(x + w - r, y + r, Math.PI * 1.5, Math.PI * 2)
  pts.push([...pts[0]])
  return pts
}

/* ---------------- 合成一张图标 ---------------- */

function makeIcon(size, { maskable }) {
  const W = size * SS
  const H = size * SS

  // 背景遮罩：普通图标圆角，maskable 满幅（系统自己裁形状）
  const bgMask = new Float32Array(W * H)
  const bgShape = maskable
    ? roundRectPath(0, 0, W, H, 0)
    : roundRectPath(0, 0, W, H, W * 0.22)
  fillNonZero([bgShape], W, H, bgMask)

  // 字形遮罩。maskable 要留出安全区（系统可能裁成圆形），所以字更小
  const ratio = maskable ? 0.52 : 0.70
  const probe = FONT.getPath(GLYPH, 0, 0, 1000)
  const bb = probe.getBoundingBox()
  const scale = (Math.min(W, H) * ratio) / Math.max(bb.x2 - bb.x1, bb.y2 - bb.y1)
  const dx = (W - (bb.x2 - bb.x1) * scale) / 2 - bb.x1 * scale
  const dy = (H - (bb.y2 - bb.y1) * scale) / 2 - bb.y1 * scale

  const glyphMask = new Float32Array(W * H)
  fillNonZero(flatten(probe.commands, { scale, dx, dy }), W, H, glyphMask)

  // 超采样缓冲 → 盒式降采样成最终像素
  const rgba = Buffer.alloc(size * size * 4)
  const box = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0
      let fg = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = (y * SS + sy) * W + (x * SS + sx)
          bg += bgMask[i]
          fg += glyphMask[i]
        }
      }
      const bgA = bg / box
      const fgA = fg / box

      // 先铺背景，再把字叠上去（字只在背景范围内出现）
      const r = BG[0] * (1 - fgA) + FG[0] * fgA
      const g = BG[1] * (1 - fgA) + FG[1] * fgA
      const b = BG[2] * (1 - fgA) + FG[2] * fgA

      const o = (y * size + x) * 4
      rgba[o] = Math.round(r)
      rgba[o + 1] = Math.round(g)
      rgba[o + 2] = Math.round(b)
      rgba[o + 3] = Math.round(bgA * 255)
    }
  }
  return encodePng(size, size, rgba)
}

/* ---------------- 跑 ---------------- */

mkdirSync(OUT_DIR, { recursive: true })

const jobs = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  // iOS 的 apple-touch-icon 不认透明和圆角，必须是不透明的满幅方图
  ['apple-touch-icon.png', 180, { maskable: true }],
]

for (const [name, size, opts] of jobs) {
  const png = makeIcon(size, opts)
  writeFileSync(resolve(OUT_DIR, name), png)
  console.log(`  ${name.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`)
}

console.log(`\n图标已生成到 ${OUT_DIR}`)

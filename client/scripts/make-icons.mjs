import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

// Draws a simple white barcode on a blue square and saves it as PNG files.
// Run it once:  node scripts/make-icons.mjs   (then commit the PNG files)

const BG = [29, 78, 216]
const WHITE = [255, 255, 255]
const BARS = [2, 1, 1, 3, 1, 2, 3, 1, 1, 2, 1, 3, 2, 1, 2] // even index = bar, odd = gap
const TOTAL = BARS.reduce((a, b) => a + b, 0)

// The barcode sits inside the middle 50% so it stays visible on round icons too.
function pixelAt(x, y, size) {
  const u = x / size
  const v = y / size
  if (u < 0.25 || u >= 0.75 || v < 0.25 || v >= 0.75) return BG
  let position = ((u - 0.25) / 0.5) * TOTAL
  let i = 0
  while (i < BARS.length - 1 && position >= BARS[i]) {
    position -= BARS[i]
    i += 1
  }
  return i % 2 === 0 ? WHITE : BG
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBytes = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])))
  return Buffer.concat([length, typeBytes, data, crc])
}

function makePng(size) {
  const stride = size * 3 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0 // filter type: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixelAt(x, y, size)
      const offset = y * stride + 1 + x * 3
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, makePng(size))
  console.log(`Wrote public/icons/icon-${size}.png`)
}

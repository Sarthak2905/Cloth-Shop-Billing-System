import { copyFileSync, existsSync, mkdirSync } from 'node:fs'

// The scanning library needs a .wasm file at runtime. By default it downloads
// it from a CDN, which breaks offline use. We copy it into /public so our own
// app serves it.
const candidates = [
  'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
  'node_modules/barcode-detector/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
]

const source = candidates.find((p) => existsSync(p))

if (!source) {
  console.error(
    'Could not find zxing_reader.wasm. Did you run "npm install barcode-detector"?',
  )
  process.exit(1)
}

mkdirSync('public', { recursive: true })
copyFileSync(source, 'public/zxing_reader.wasm')
console.log(`Copied ${source} -> public/zxing_reader.wasm`)

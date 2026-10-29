const FORMATS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e']

let detectorPromise = null

// Loads the scanning library only when the camera is first used, and points it
// at our own copy of the .wasm file (so it works offline).
export function createDetector() {
  detectorPromise ??= import('barcode-detector/ponyfill')
    .then(({ BarcodeDetector, prepareZXingModule }) => {
      prepareZXingModule({
        overrides: {
          locateFile: (path, prefix) =>
            path.endsWith('.wasm')
              ? `${import.meta.env.BASE_URL}zxing_reader.wasm`
              : prefix + path,
        },
      })
      return new BarcodeDetector({ formats: FORMATS })
    })
    .catch((err) => {
      detectorPromise = null // allow a retry later
      throw err
    })
  return detectorPromise
}

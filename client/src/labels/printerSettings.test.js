import {
  DEFAULT_PRINTER_SETTINGS,
  loadPrinterSettings,
  savePrinterSettings,
  tsplOptions,
} from './printerSettings'

beforeEach(() => localStorage.clear())

test('with nothing saved the defaults are used, and direct printing is off', () => {
  expect(loadPrinterSettings()).toEqual(DEFAULT_PRINTER_SETTINGS)
  expect(loadPrinterSettings().direct).toBe(false)
})

test('saved settings come back, and numbers out of range are pulled into range', () => {
  savePrinterSettings({
    direct: true,
    helperUrl: ' http://127.0.0.1:9200 ',
    printerName: ' My TSC ',
    gapMm: 99,
    density: -4,
    offsetXmm: 'x',
    offsetYmm: 2.5,
    upsideDown: true,
  })

  expect(loadPrinterSettings()).toEqual({
    direct: true,
    helperUrl: 'http://127.0.0.1:9200',
    printerName: 'My TSC',
    gapMm: 20,
    density: 0,
    upsideDown: true,
    offsetXmm: 0,
    offsetYmm: 2.5,
  })
})

test('a partial or damaged saved value gives the defaults for what is missing', () => {
  savePrinterSettings({ direct: true })
  expect(loadPrinterSettings()).toEqual({
    ...DEFAULT_PRINTER_SETTINGS,
    direct: true,
  })

  localStorage.setItem('labelPrinterSettings', '{broken')
  expect(loadPrinterSettings()).toEqual(DEFAULT_PRINTER_SETTINGS)
})

test('upside-down turns the print direction to 0, and the other settings carry over', () => {
  expect(tsplOptions({})).toEqual({
    gapMm: 3,
    density: 8,
    direction: 1,
    offsetXmm: 0,
    offsetYmm: 0,
  })
  expect(
    tsplOptions({ upsideDown: true, gapMm: 2, density: 10, offsetXmm: 1 }),
  ).toEqual({
    gapMm: 2,
    density: 10,
    direction: 0,
    offsetXmm: 1,
    offsetYmm: 0,
  })
})

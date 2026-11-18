import { renderLabelBitmap, renderTestBitmap } from './rasterLabel'
import { buildLabelJob } from './tspl'

// entries: [{ label, copies }]. `options` come from tsplOptions() in printerSettings.js.
export async function buildLabelPrintJob({
  entries,
  widthMm,
  heightMm,
  options = {},
  render = renderLabelBitmap,
}) {
  const labels = []
  for (const { label, copies } of entries) {
    labels.push({ bitmap: await render(label, { widthMm, heightMm }), copies })
  }
  return buildLabelJob({ widthMm, heightMm, ...options, labels })
}

export async function buildTestPrintJob({
  widthMm,
  heightMm,
  options = {},
  render = renderTestBitmap,
}) {
  const bitmap = await render({ widthMm, heightMm })
  return buildLabelJob({
    widthMm,
    heightMm,
    ...options,
    labels: [{ bitmap, copies: 1 }],
  })
}

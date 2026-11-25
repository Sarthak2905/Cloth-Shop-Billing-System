import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { useFieldScanner } from './useFieldScanner'

function Harness({ onScan }) {
  useFieldScanner({ onScan })
  return (
    <>
      <input aria-label="name" defaultValue="Ravi" />
      <input aria-label="barcode" data-scan-self defaultValue="" />
    </>
  )
}

// types characters the way the browser does: a key press, then the box gets the character
function type(box, text) {
  for (const ch of text) {
    fireEvent.keyDown(box, { key: ch })
    fireEvent.change(box, { target: { value: box.value + ch } })
  }
}

afterEach(() => vi.restoreAllMocks())

test('a fast scan in another box is handed over, and the box gets its old text back', () => {
  const onScan = vi.fn()
  render(<Harness onScan={onScan} />)
  const box = screen.getByLabelText('name')

  type(box, 'CLO000001')
  fireEvent.keyDown(box, { key: 'Enter' })

  expect(onScan).toHaveBeenCalledWith('CLO000001')
  expect(box).toHaveValue('Ravi')
})

test('slow typing is left alone', () => {
  let t = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (t += 200))
  const onScan = vi.fn()
  render(<Harness onScan={onScan} />)
  const box = screen.getByLabelText('name')

  type(box, 'Ramesh')
  fireEvent.keyDown(box, { key: 'Enter' })

  expect(onScan).not.toHaveBeenCalled()
  expect(box).toHaveValue('RaviRamesh')
})

test('the barcode box handles its own scans', () => {
  const onScan = vi.fn()
  render(<Harness onScan={onScan} />)
  const box = screen.getByLabelText('barcode')

  type(box, 'CLO000001')
  fireEvent.keyDown(box, { key: 'Enter' })

  expect(onScan).not.toHaveBeenCalled()
})
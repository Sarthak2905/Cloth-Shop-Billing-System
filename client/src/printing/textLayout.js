// Receipt text is laid out by what a person SEES as one character (a
// "grapheme"), not by raw string length. That keeps Marathi letters together
// with their vowel signs when a line is wrapped.

const segmenter =
  typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

export function graphemes(text) {
  const value = String(text ?? '')
  return segmenter
    ? Array.from(segmenter.segment(value), (part) => part.segment)
    : Array.from(value)
}

export function visualLength(text) {
  return graphemes(text).length
}

export function padEnd(text, width) {
  const gap = width - visualLength(text)
  return gap > 0 ? text + ' '.repeat(gap) : text
}

// Wraps at word boundaries. A word longer than the line is broken between
// whole characters.
export function wrapText(text, width) {
  const limit = Math.max(1, width)
  const lines = []

  for (const paragraph of String(text ?? '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    let current = ''

    for (const word of words) {
      let remaining = word
      while (visualLength(remaining) > limit) {
        if (current) {
          lines.push(current)
          current = ''
        }
        const parts = graphemes(remaining)
        lines.push(parts.slice(0, limit).join(''))
        remaining = parts.slice(limit).join('')
      }

      if (!current) current = remaining
      else if (visualLength(current) + 1 + visualLength(remaining) <= limit) {
        current += ` ${remaining}`
      } else {
        lines.push(current)
        current = remaining
      }
    }
    lines.push(current)
  }
  return lines
}

export function centerText(text, width) {
  return wrapText(text, width).map((line) => {
    const gap = width - visualLength(line)
    return ' '.repeat(Math.max(0, Math.floor(gap / 2))) + line
  })
}

export function divider(width, char = '-') {
  return char.repeat(width)
}

// Left text and right text on one row, right text at the right edge. If the
// left text is too long it wraps, and the right text goes on the last line.
export function twoColumns(left, right, width, indent = 0) {
  const rightLength = visualLength(right)
  const room = Math.max(1, width - rightLength - 1 - indent)
  const lines = wrapText(left, room).map((line) => ' '.repeat(indent) + line)
  const last = lines.length - 1
  lines[last] = padEnd(lines[last], width - rightLength) + right
  return lines
}

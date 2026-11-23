import { findLibraryItem, rotationStep } from '../circuit/library.js'
import { isTwoTerminal } from '../circuit/partGeometry.js'

// Which way a part is drawn in a scanned or rendered schematic, read from the lines around its label. A two-terminal part
// sits in a wire, so it shows up as two collinear leads with a gap between them: its body. Text the OCR has read is blanked
// first, so lettering does not look like leads. Sizes are tuned on a 2000 px wide page and scale with the image.
const INK_LEVEL = 140
const REFERENCE_WIDTH = 2000
const REACH = 60
const MIN_LEAD = 8
const VERTICAL_BIAS = 1.15
// A diagonal reading must beat the straight ones. On the Classic 50 sheets, diodes on straight leads scored at most 0.6 of their
// straight reading on the diagonals, and the bridge rectifier diodes 1.1 to 4 times it.
const DIAGONAL_BIAS = 1
const LINE_TOLERANCE = 2
const MAX_LEAD_WEIGHT = 40

// How wide the body between two leads is, in pixels on a reference-sized page, by kind of part.
const BODY_GAP = { RESISTORS: [14, 70], FUSES: [14, 70], CAPACITORS: [2, 16], DIODES: [6, 40] }
const DEFAULT_GAP = [8, 80]

const bodyGapOf = (type, factor) => (BODY_GAP[findLibraryItem(type)?.category] ?? DEFAULT_GAP).map((size) => size * factor)

// The ink in a square around `center` as a grid, with text boxes blanked: { left, top, size, ink (Uint8Array) }.
function inkGrid(image, center, reach, textBoxes) {
  const left = Math.max(0, Math.floor(center[0] - reach))
  const top = Math.max(0, Math.floor(center[1] - reach))
  const width = Math.min(image.width, Math.ceil(center[0] + reach) + 1) - left
  const height = Math.min(image.height, Math.ceil(center[1] + reach) + 1) - top
  const ink = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = ((top + y) * image.width + left + x) * 4
      if (image.data[index + 3] > 128 && 0.299 * image.data[index] + 0.587 * image.data[index + 1] + 0.114 * image.data[index + 2] < INK_LEVEL) ink[y * width + x] = 1
    }
  }
  for (const [boxLeft, boxTop, boxRight, boxBottom] of textBoxes) {
    const from = Math.max(left, Math.floor(boxLeft) - 1)
    const to = Math.min(left + width - 1, Math.ceil(boxRight) + 1)
    for (let y = Math.max(top, Math.floor(boxTop) - 1); y <= Math.min(top + height - 1, Math.ceil(boxBottom) + 1); y += 1) {
      for (let x = from; x <= to; x += 1) ink[(y - top) * width + x - left] = 0
    }
  }
  return { left, top, width, height, ink }
}

// Straight ink runs of at least `minLength` along one direction, bridging a one-pixel break: [{ line, start, end }].
function runsOf(grid, horizontal, minLength) {
  const runs = []
  const lines = horizontal ? grid.height : grid.width
  const length = horizontal ? grid.width : grid.height
  const at = (line, position) => grid.ink[horizontal ? line * grid.width + position : position * grid.width + line]
  for (let line = 0; line < lines; line += 1) {
    let start = -1
    let gap = 0
    for (let position = 0; position <= length; position += 1) {
      if (position < length && at(line, position)) {
        if (start < 0) start = position
        gap = 0
        continue
      }
      if (start < 0) continue
      gap += 1
      if (gap > 1 || position >= length) {
        const end = position - gap
        if (end - start + 1 >= minLength) runs.push({ line, start, end })
        start = -1
        gap = 0
      }
    }
  }
  return runs
}

// How strongly the runs form collinear lead pairs with a body-sized gap, the pairs nearer `center` counting for more.
function pairScore(runs, center, reach, [gapMin, gapMax], horizontal) {
  const byLine = new Map()
  for (const run of runs) byLine.set(run.line, [...(byLine.get(run.line) ?? []), run])
  let total = 0
  for (const first of runs) {
    for (let line = first.line - LINE_TOLERANCE; line <= first.line + LINE_TOLERANCE; line += 1) {
      for (const second of byLine.get(line) ?? []) {
        const gap = second.start - first.end
        if (gap < gapMin || gap > gapMax) continue
        const middle = (first.end + second.start) / 2
        const distance = horizontal ? Math.hypot(middle - center[0], first.line - center[1]) : Math.hypot(first.line - center[0], middle - center[1])
        total += Math.min(first.end - first.start, second.end - second.start, MAX_LEAD_WEIGHT) / (1 + distance / (0.5 * reach))
      }
    }
  }
  return total
}

// Lead pairs along a diagonal: `down` follows the line x = y (top left to bottom right), otherwise x = -y. A diagonal stroke
// steps between pixels, so a neighbouring pixel also counts as ink. Lengths are measured along the line.
function diagonalScore(grid, center, reach, [gapMin, gapMax], minLead, down) {
  const [dx, dy] = down ? [1, 1] : [1, -1]
  const step = Math.SQRT2
  const at = (x, y) => x >= 0 && y >= 0 && x < grid.width && y < grid.height && grid.ink[y * grid.width + x] === 1
  const inkAt = (x, y) => at(x, y) || at(x + 1, y) || at(x, y + 1)
  const span = Math.ceil(reach / step)
  const runs = []
  for (let line = -span; line <= span; line += 1) {
    const originX = center[0] - dy * line
    const originY = center[1] + dx * line
    let start = null
    let gap = 0
    for (let position = -span; position <= span + 1; position += 1) {
      const on = position <= span && inkAt(Math.round(originX + dx * position), Math.round(originY + dy * position))
      if (on) {
        if (start === null) start = position
        gap = 0
        continue
      }
      if (start === null) continue
      gap += 1
      if (gap > 1 || position > span) {
        const end = position - gap
        if ((end - start + 1) * step >= minLead) runs.push({ line, start, end })
        start = null
        gap = 0
      }
    }
  }
  let total = 0
  for (const first of runs) {
    for (const second of runs) {
      if (Math.abs(first.line - second.line) > LINE_TOLERANCE) continue
      const gap = (second.start - first.end) * step
      if (gap < gapMin || gap > gapMax) continue
      const middle = (first.end + second.start) / 2
      const distance = Math.hypot(-dy * first.line + dx * middle, dx * first.line + dy * middle)
      total += Math.min((first.end - first.start) * step, (second.end - second.start) * step, MAX_LEAD_WEIGHT) / (1 + distance / (0.5 * reach))
    }
  }
  return total
}

// How strongly the drawing around `center` (image pixels) shows a part of `type` lying flat and standing upright, and for parts
// that can sit at 45° (diodes) also along either diagonal: { horizontal, vertical, diagonalDown?, diagonalUp? }.
export function leadPairs(image, center, { type, textBoxes = [], scale = image.width / REFERENCE_WIDTH }) {
  const factor = Math.min(3, Math.max(0.5, scale))
  const reach = REACH * factor
  const grid = inkGrid(image, center, reach, textBoxes)
  const local = [center[0] - grid.left, center[1] - grid.top]
  const minLead = Math.max(4, MIN_LEAD * factor)
  const gap = bodyGapOf(type, factor)
  const scores = {
    horizontal: pairScore(runsOf(grid, true, minLead), local, reach, gap, true),
    vertical: pairScore(runsOf(grid, false, minLead), local, reach, gap, false),
  }
  if (rotationStep(type) !== 45) return scores
  // A diagonal line through the search square runs out to its corners, so diagonals are read from a wider crop.
  const wide = inkGrid(image, center, reach * Math.SQRT2, textBoxes)
  const wideCenter = [center[0] - wide.left, center[1] - wide.top]
  return { ...scores, diagonalDown: diagonalScore(wide, wideCenter, reach, gap, minLead, true), diagonalUp: diagonalScore(wide, wideCenter, reach, gap, minLead, false) }
}

// 90 when the part around `center` is drawn upright, 0 when it lies flat or the lines are inconclusive. A diode drawn on a diagonal,
// as in a bridge rectifier, gets 45 (top left to bottom right) or 315 (bottom left to top right); which end is the cathode is not read.
export function estimateRotation(image, center, options) {
  const { horizontal, vertical, diagonalDown = 0, diagonalUp = 0 } = leadPairs(image, center, options)
  const straight = vertical > VERTICAL_BIAS * horizontal ? 90 : 0
  const diagonal = Math.max(diagonalDown, diagonalUp)
  if (diagonal > DIAGONAL_BIAS * Math.max(horizontal, vertical)) return diagonalDown >= diagonalUp ? 45 : 315
  return straight
}

// The rotation to give a detected component: a matched symbol's own, else what its surroundings say for parts that can be turned.
// Tubes and other multi-terminal symbols stay as drawn in the toolbox. `textBoxes` are the OCR word boxes, [left, top, right, bottom].
export function rotationFor(image, item, textBoxes = []) {
  if (item.symbolRotation !== undefined) return item.symbolRotation
  if (!isTwoTerminal({ type: item.type }) && item.type !== 'potentiometer') return 0
  return estimateRotation(image, item.center, { type: item.type, textBoxes })
}

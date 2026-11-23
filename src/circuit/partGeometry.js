import { MAX_SCALE, MIN_SCALE } from '../shared/zoom.js'
import { detailedTubeTypes, isTriodeSection } from '../tubes/triodes.js'
import { findLibraryItem } from './library.js'
import { RIBBON_REACH, RIBBON_TYPE, isRibbon, pinsOf, ribbonHalfHeight, ribbonOffsets } from './ribbon.js'
import { rotatedBounds } from './rects.js'
import { TRANSFORMER_TERMINALS } from './transformers.js'

// Where a part's terminals and body are on the canvas, from its type, position, rotation and size. The one place that knows
// the geometry of the symbols; wires, connection dots, wire following, the canvas and the simulator all read it from here.
// The numbers describe the symbols in components/symbols, in symbol coordinates (centre 0,0, before rotation and scale);
// change a symbol and its entry here together.

// Components can be drawn larger or smaller than the standard symbol to match a reference drawing.
export const scaleOf = (component) => component.scale ?? 1

// How far the standard symbol of a type extends, used to size it to a marked symbol in a reference image.
export const nominalSymbolSize = (type) => (detailedTubeTypes.includes(type) ? 260 : 80)

// How long a symbol is drawn on a schematic, in heights of the reference labels printed beside it. Measured on hand-sized
// parts of the Peavey Classic 50 main board (two-terminal parts) and one EL84 (tubes); a starting size, not a rule.
const SYMBOL_LABEL_HEIGHTS = { tube: 13.5, part: 2.6 }

// The size, as a multiple of the standard symbol, a component of `type` likely has on a drawing whose reference labels are
// `labelHeight` diagram units high. Null when the height is unknown.
export function scaleFromLabelHeight(type, labelHeight) {
  if (!(labelHeight > 0)) return null
  const length = labelHeight * (detailedTubeTypes.includes(type) ? SYMBOL_LABEL_HEIGHTS.tube : SYMBOL_LABEL_HEIGHTS.part)
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, length / nominalSymbolSize(type))) * 100) / 100
}

// Parts with exactly two terminals, one at each end of the lead (resistors, capacitors, diodes, fuses, inductors, sources, switches).
export function isTwoTerminal(component) {
  const entry = findLibraryItem(component.type)
  return Boolean(
    entry &&
    ((['RESISTORS', 'CAPACITORS', 'DIODES', 'FUSES'].includes(entry.category) && component.type !== 'potentiometer') || ['inductor', 'source', 'switch'].includes(component.type)),
  )
}

// Terminals in symbol coordinates. For two-terminal parts `a` is the positive side of a source and polarised capacitor and the
// anode of a diode. A pin marked `ignored` is drawn but not part of the circuit (a tube heater).
const TWO_TERMINALS = [
  { pin: 'a', x: -40, y: 0 },
  { pin: 'b', x: 40, y: 0 },
]
const POTENTIOMETER = [...TWO_TERMINALS, { pin: 'w', x: 0, y: 40 }]
const GROUND = [{ pin: 'g', x: 0, y: 0 }]
const TRANSISTOR = [
  { pin: 'b', x: -40, y: 0 },
  { pin: 'c', x: 20, y: -20 },
  { pin: 'e', x: 20, y: 20 },
]
const TRIODE_SECTION = [
  { pin: 'p', x: 0, y: -42 },
  { pin: 'g', x: -46, y: -1 },
  { pin: 'k', x: -10, y: 42 },
  { pin: 'h1', x: 2, y: 42, ignored: true },
  { pin: 'h2', x: 16, y: 42, ignored: true },
]

// A ribbon cable has a pin on each side for every wire, left then right, named L<n> and R<n> after the J number.
const ribbonShape = (component) => {
  const pins = pinsOf(component)
  return ribbonOffsets(pins.length).flatMap((y, index) => [
    { pin: `L${pins[index]}`, x: -RIBBON_REACH, y },
    { pin: `R${pins[index]}`, x: RIBBON_REACH, y },
  ])
}

function shapeOf(component) {
  const { type } = component
  if (type === RIBBON_TYPE) return ribbonShape(component)
  if (type === 'potentiometer') return POTENTIOMETER
  if (type === 'ground') return GROUND
  if (type === 'transistor') return TRANSISTOR
  if (isTriodeSection(type)) return TRIODE_SECTION
  if (TRANSFORMER_TERMINALS[type]) return TRANSFORMER_TERMINALS[type]
  return isTwoTerminal(component) ? TWO_TERMINALS : []
}

const rounded = (value) => Math.round(value * 1000) / 1000

// The terminals of a component on the canvas: [{ pin, point: [x, y], ignored }]. Empty for parts drawn without terminals we know
// (the full-size tubes, relays).
export function terminalsOf(component) {
  const scale = scaleOf(component)
  const angle = (component.rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return shapeOf(component).map(({ pin, x, y, ignored }) => ({
    pin,
    ignored: Boolean(ignored),
    point: [rounded(component.x + (x * cos - y * sin) * scale), rounded(component.y + (x * sin + y * cos) * scale)],
  }))
}

// The area a component's symbol covers, centred on the component and turned with it for a diagonal part.
export function selectionBoxOf(component) {
  const diagonal = component.rotation % 90 !== 0
  const sideways = !diagonal && component.rotation % 180 !== 0
  let box = { x: -48, y: -36, width: 96, height: 72 }
  if (detailedTubeTypes.includes(component.type)) box = { x: -168, y: -168, width: 336, height: 336 }
  else if (component.type === 'potentiometer') box = { x: -48, y: -48, width: 96, height: 96 }
  else if (isTriodeSection(component.type)) box = { x: -50, y: -46, width: 120, height: 102 }
  else if (isRibbon(component.type)) {
    const half = ribbonHalfHeight(pinsOf(component).length) + 4
    box = { x: -62, y: -half, width: 124, height: 2 * half }
  }
  if (sideways) box = { x: box.y, y: box.x, width: box.height, height: box.width }
  const scale = scaleOf(component)
  return { box: Object.fromEntries(Object.entries(box).map(([key, size]) => [key, size * scale])), rotation: diagonal ? component.rotation : 0 }
}

// The space a symbol takes on the canvas as [left, top, right, bottom], closer to the drawn lines than its selection box: what
// labels and layouts keep clear. Two-terminal parts are a lead long and a little over a grid square wide.
export function bodyRectOf(component) {
  const scale = scaleOf(component)
  const [left, top, right, bottom] = isTwoTerminal(component)
    ? rotatedBounds({ x: -40 * scale, y: -16 * scale, width: 80 * scale, height: 32 * scale }, component.rotation)
    : (() => {
        const { box, rotation } = selectionBoxOf(component)
        return rotatedBounds(box, rotation)
      })()
  return [component.x + left, component.y + top, component.x + right, component.y + bottom]
}

// The area a component takes up for hit-testing and for wire ends to belong to it, as [left, top, right, bottom]: its
// selection box. Parts whose areas overlap can claim each other's wires, so layouts keep these apart.
export function areaRectOf(component) {
  const { box, rotation } = selectionBoxOf(component)
  const [left, top, right, bottom] = rotatedBounds(box, rotation)
  return [component.x + left, component.y + top, component.x + right, component.y + bottom]
}

const BOX_TOLERANCE = 0.01

// Whether a canvas point is inside a component's selection box.
export function boxContains(component, [x, y]) {
  const { box, rotation } = selectionBoxOf(component)
  const angle = (-rotation * Math.PI) / 180
  const dx = x - component.x
  const dy = y - component.y
  const localX = dx * Math.cos(angle) - dy * Math.sin(angle)
  const localY = dx * Math.sin(angle) + dy * Math.cos(angle)
  return localX >= box.x - BOX_TOLERANCE && localX <= box.x + box.width + BOX_TOLERANCE && localY >= box.y - BOX_TOLERANCE && localY <= box.y + box.height + BOX_TOLERANCE
}

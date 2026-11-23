// A ribbon cable joining two circuit boards: a row of parallel conductors, each a numbered pin (J1, J2…) with a
// connection point on either side. Pins are 20 units apart, so they sit on the grid whatever the number of wires.

export const RIBBON_TYPE = 'ribbon-cable'
export const RIBBON_PITCH = 20
// How far the connection points sit left and right of the centre.
export const RIBBON_REACH = 60
export const MIN_RIBBON_WIRES = 2
export const MAX_RIBBON_WIRES = 64
export const RIBBON_WIRE_COUNTS = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 26, 34, 40]
export const DEFAULT_RIBBON_PINS = [1, 2, 3, 4, 5, 6]
const MAX_PIN_NUMBER = 9999

export const isRibbon = (type) => type === RIBBON_TYPE
export const pinsOf = (component) => (component.pins?.length ? component.pins : DEFAULT_RIBBON_PINS)
export const pinLabel = (number) => `J${number}`
export const ribbonValue = (count) => `${count}-way ribbon`

// The offset of each conductor from the centre, across the cable.
export const ribbonOffsets = (count) => Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * RIBBON_PITCH)
export const ribbonHalfHeight = (count) => (count * RIBBON_PITCH) / 2

export const validPins = (pins) =>
  Array.isArray(pins) && pins.length >= MIN_RIBBON_WIRES && pins.length <= MAX_RIBBON_WIRES && pins.every((pin) => Number.isInteger(pin) && pin >= 0 && pin <= MAX_PIN_NUMBER)

// The pin numbers a new cable starts with: the next free J numbers after every ribbon pin already drawn.
export function nextPins(components, count = DEFAULT_RIBBON_PINS.length) {
  const used = components.filter((component) => isRibbon(component.type)).flatMap(pinsOf)
  return renumberPins(count, used.length ? Math.max(...used) + 1 : 1)
}

export const renumberPins = (count, first) => Array.from({ length: count }, (_, index) => first + index)

// Changes the number of wires: extra wires continue the numbering after the highest pin, fewer drops the last ones.
export function resizePins(pins, count) {
  const size = Math.min(MAX_RIBBON_WIRES, Math.max(MIN_RIBBON_WIRES, count))
  if (size <= pins.length) return pins.slice(0, size)
  return [...pins, ...renumberPins(size - pins.length, Math.max(...pins) + 1)]
}

// The cable with new pins; a value still reading "N-way ribbon" follows the new number of wires.
export function withRibbonPins(component, pins) {
  const value = /^\d+-way ribbon$/.test(component.value) || !component.value ? ribbonValue(pins.length) : component.value
  return { ...component, pins, value }
}

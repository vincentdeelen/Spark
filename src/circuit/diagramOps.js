import { closestPointOnSegment, withoutRepeats } from './geometry.js'
import { isTwoTerminal, scaleOf } from './partGeometry.js'
import { isRibbon, nextPins, pinsOf, resizePins, withRibbonPins } from './ribbon.js'
import { withWireEnd } from './wireMarkers.js'
import { followMove } from './wireFollow.js'
import { RATING_FIELD_NAMES, ratingFields } from './ratings.js'
import { findLibraryItem } from './library.js'
import { splitSectionLabel } from '../tubes/triodes.js'
import { makeId } from '../shared/ids.js'
import { nextReference } from './references.js'

// A new component for a toolbox item; label and value default to the item's conventions.
export function createComponent(item, components, { x, y, rotation = 0, label, value, scale = 1 }) {
  const component = {
    id: makeId(),
    type: item.type,
    x,
    y,
    rotation,
    label: label || nextReference(item, components),
    value: value ?? (item.type === 'ground' ? '' : item.value),
    ...(scale !== 1 ? { scale } : {}),
    ...item.defaults,
    ...(isRibbon(item.type) ? { pins: nextPins(components) } : {}),
  }
  // A triode section labelled V2B is the tube's second triode.
  const section = item.defaults?.section && splitSectionLabel(component.label)?.section
  return section ? { ...component, section } : component
}

// The size components drawn on a reference image should have: the typical size of those already sized to it.
export function referenceScale(components) {
  const scales = components.flatMap((component) => (component.scale ? [component.scale] : [])).sort((a, b) => a - b)
  if (!scales.length) return 1
  const middle = Math.floor(scales.length / 2)
  return scales.length % 2 ? scales[middle] : (scales[middle - 1] + scales[middle]) / 2
}

export function createWire(points, label) {
  return { id: makeId(), points, ...(label ? { label } : {}) }
}

export const withComponent = (diagram, component) => ({ ...diagram, components: [...diagram.components, component] })

export const withWire = (diagram, wire) => ({ ...diagram, wires: [...diagram.wires, wire] })

export function withoutElements(diagram, ids) {
  return {
    ...diagram,
    components: diagram.components.filter((item) => !ids.has(item.id)),
    wires: diagram.wires.filter((item) => !ids.has(item.id)),
  }
}

const WIRE_REACH = 14

// The wire segment closest to a point, when it is within reach: { wire, index (of the segment's first point), point (on the segment) }.
export function findWireAt(diagram, point, reach = WIRE_REACH) {
  let best = null
  for (const wire of diagram.wires) {
    wire.points.slice(1).forEach((end, index) => {
      const onSegment = closestPointOnSegment(point, wire.points[index], end)
      const distance = Math.hypot(point[0] - onSegment[0], point[1] - onSegment[1])
      if (distance <= reach && (!best || distance < best.distance)) best = { wire, index, point: onSegment, distance }
    })
  }
  return best && { wire: best.wire, index: best.index, point: best.point }
}

// Connects a two-terminal component into the wire under `point`: the component is turned along the wire, centred there, and
// the wire is cut so its two ends meet the component's terminals. Returns the new diagram, or null when there is no
// straight wire segment with room for the component.
export function insertIntoWire(diagram, componentId, point, snap, makeNewId = makeId) {
  const component = diagram.components.find((item) => item.id === componentId)
  const hit = component && findWireAt(diagram, point)
  if (!hit) return null
  const { wire, index } = hit
  const start = wire.points[index]
  const end = wire.points[index + 1]
  const horizontal = start[1] === end[1]
  if (!horizontal && start[0] !== end[0]) return null
  const axis = horizontal ? 0 : 1
  const reach = 40 * (component.scale ?? 1)
  const low = Math.min(start[axis], end[axis]) + reach
  const high = Math.max(start[axis], end[axis]) - reach
  if (low > high) return null
  const center = Math.min(high, Math.max(low, snap(hit.point[axis])))
  const direction = Math.sign(end[axis] - start[axis])
  const at = (along) => (horizontal ? [along, start[1]] : [start[0], along])
  const before = withoutRepeats([...wire.points.slice(0, index + 1), at(center - direction * reach)])
  const after = withoutRepeats([at(center + direction * reach), ...wire.points.slice(index + 1)])
  const pieces = [before.length > 1 && { ...wire, points: before }, after.length > 1 && { ...wire, id: makeNewId(), points: after }].filter(Boolean)
  const placed = { ...component, ...(horizontal ? { x: center, y: start[1] } : { x: start[0], y: center }), rotation: horizontal ? 0 : 90 }
  return {
    ...diagram,
    components: diagram.components.map((item) => (item.id === componentId ? placed : item)),
    wires: diagram.wires.flatMap((item) => (item.id === wire.id ? pieces : [item])),
  }
}

// The component changed to another subtype of its family (a resistor to a potentiometer, a fuse to a glass cartridge fuse):
// label and position stay; ratings the new type has stay too, and the value follows the new type's default when the old one
// was still the default.
export function changeSubtype(component, nextType) {
  const from = findLibraryItem(component.type)
  const to = findLibraryItem(nextType)
  if (!to) return component
  const supported = ratingFields(nextType)
  const kept = Object.fromEntries(Object.entries(component).filter(([key]) => !RATING_FIELD_NAMES.includes(key) || supported.includes(key)))
  const defaults = Object.fromEntries(Object.entries(to.defaults ?? {}).filter(([key]) => !kept[key]))
  const section = supported.includes('section') ? splitSectionLabel(component.label)?.section : undefined
  return { ...kept, ...defaults, ...(section ? { section } : {}), type: nextType, value: !component.value || component.value === from?.value ? to.value : component.value }
}

// --- Edits the editor commands make. Each returns the new diagram and leaves the original untouched.

// A label is placed for one size and turn of its symbol, so a change of either puts it back in its default place.
const withDefaultLabel = (component) => {
  const { labelPlacement, ...rest } = component
  return labelPlacement ? rest : component
}

const mapComponents = (diagram, ids, change) => {
  const chosen = new Set(ids)
  return { ...diagram, components: diagram.components.map((item) => (chosen.has(item.id) ? change(item) : item)) }
}

export const rotateComponents = (diagram, ids, step = 90) => mapComponents(diagram, ids, (item) => ({ ...withDefaultLabel(item), rotation: (item.rotation + step) % 360 }))

export const changeSubtypes = (diagram, ids, type) => mapComponents(diagram, ids, (item) => withDefaultLabel(changeSubtype(item, type)))

// Gives ribbon cables the wanted number of wires, keeping the J numbers they have.
export const setRibbonWireCount = (diagram, ids, count) => mapComponents(diagram, ids, (item) => withDefaultLabel(withRibbonPins(item, resizePins(pinsOf(item), count))))

export const scaleComponent = (diagram, id, scale) => mapComponents(diagram, [id], (item) => ({ ...withDefaultLabel(item), scale }))

// Moves a component by (dx, dy); `attached` (see wireFollow.attachedEnds) are the wire ends that follow it.
export function moveComponent(diagram, id, dx, dy, attached = {}) {
  return { ...mapComponents(diagram, [id], (item) => ({ ...item, x: item.x + dx, y: item.y + dy })), wires: followMove(diagram.wires, attached, dx, dy) }
}

// Changes the arrow or label at one end ('start' or 'end') of a wire.
export const changeWireEnd = (diagram, wireId, key, changes) => ({ ...diagram, wires: diagram.wires.map((wire) => (wire.id === wireId ? withWireEnd(wire, key, changes) : wire)) })

// The two-terminal component that a newly placed two-terminal part sits on top of, if any.
export function twoTerminalUnder(diagram, placed, point) {
  if (!isTwoTerminal(placed)) return undefined
  return diagram.components.find((item) => {
    if (!isTwoTerminal(item)) return false
    const sideways = item.rotation % 180 !== 0
    return Math.abs(point[0] - item.x) <= (sideways ? 36 : 48) * scaleOf(item) && Math.abs(point[1] - item.y) <= (sideways ? 48 : 36) * scaleOf(item)
  })
}

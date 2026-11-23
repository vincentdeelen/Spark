import { detailedTubeTypes, isTriodeSection } from '../tubes/triodes.js'
import { segmentsOf, withoutRepeats } from './geometry.js'
import { bodyRectOf, scaleOf } from './partGeometry.js'
import { inflate, overlapArea, rectGap, segmentCrossesRect } from './rects.js'
import { isRibbon, pinsOf, ribbonHalfHeight } from './ribbon.js'
import { wireLabelPosition } from './sections.js'
import { wireEndMarkers } from './wireMarkers.js'

// Where each component's reference (R10, C8…) is written. A label is `{ x, y, anchor, size }`: the text's anchor point
// relative to the component's position, how it hangs from that point, and the font size. A component without one has its
// label in the default place for its kind of symbol; "Optimize labels" gives every label a place of its own, directly next to
// its component and clear of other parts, wires and labels.

export const LABEL_SIZE = 11
const LABEL_SIZES = [LABEL_SIZE, 9.5, 8, 7]
const CHARACTER_WIDTH = 0.62
const ASCENT = 0.78
const DESCENT = 0.24
const GAPS = [2, 7]
// Obstacles written on the canvas besides the component labels, with the font sizes they use.
const WIRE_LABEL_SIZE = 14
const END_LABEL_SIZE = 11

export const hasLabel = (component) => component.type !== 'ground' && Boolean(component.label)

// Where a label sits when nobody placed it: above the symbol, beside it when the part is turned, in the free corner for a
// diagonal one.
export function defaultLabelPlacement(component) {
  const isTube = detailedTubeTypes.includes(component.type)
  const isPot = component.type === 'potentiometer'
  const diagonal = component.rotation % 90 !== 0
  const sideways = !diagonal && component.rotation % 180 !== 0
  const fallsToRight = component.rotation % 180 === 45
  let x = 0
  if (diagonal) x = 24
  else if (!isTube && sideways) x = isPot && component.rotation === 270 ? 58 : 42
  let y = -30
  if (isTube) y = 185
  else if (diagonal) y = fallsToRight ? -18 : 32
  else if (sideways) y = 4
  else if (isPot && component.rotation === 180) y = -52
  else if (isTriodeSection(component.type)) y = -50
  // A ribbon cable's height follows its number of wires; its label sits above it, or beside it when turned.
  if (isRibbon(component.type)) {
    const half = ribbonHalfHeight(pinsOf(component).length)
    if (sideways) x = half + 8
    else y = -half - 10
  }
  const scale = scaleOf(component)
  return { x: x * scale, y: y * scale, anchor: diagonal || (!isTube && sideways) ? 'start' : 'middle', size: LABEL_SIZE }
}

export const labelPlacementOf = (component) => ({ ...defaultLabelPlacement(component), ...component.labelPlacement })

const textWidth = (text, size) => text.length * size * CHARACTER_WIDTH

// The area a text covers, as [left, top, right, bottom] around its anchor point at (x, y).
function textRect(text, x, y, anchor, size) {
  const width = textWidth(text, size)
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
  return [left, y - ASCENT * size, left + width, y + DESCENT * size]
}

// The area a component's label covers on the canvas.
export function labelRectOf(component, placement = labelPlacementOf(component)) {
  return textRect(component.label, component.x + placement.x, component.y + placement.y, placement.anchor, placement.size)
}

// The positions a label could take around a body: centred or flush with either end on the four sides, and the four corners,
// close or a little further away, in each font size from the largest down. Ordered by how natural the position is.
function candidatePlacements(component, body) {
  const [left, top, right, bottom] = body
  const [centreX, centreY] = [(left + right) / 2, (top + bottom) / 2]
  const found = []
  for (const size of LABEL_SIZES) {
    const width = textWidth(component.label, size)
    const height = (ASCENT + DESCENT) * size
    for (const gap of GAPS) {
      const across = [centreX - width / 2, left, right - width]
      const along = [centreY - height / 2, top, bottom - height]
      across.forEach((x, rank) => {
        found.push({ rect: [x, top - gap - height, x + width, top - gap], size, gap, rank: rank + (gap > GAPS[0] ? 1 : 0) })
        found.push({ rect: [x, bottom + gap, x + width, bottom + gap + height], size, gap, rank: rank + 1 + (gap > GAPS[0] ? 1 : 0) })
      })
      along.forEach((y, rank) => {
        found.push({ rect: [right + gap, y, right + gap + width, y + height], size, gap, rank: rank + 1 + (gap > GAPS[0] ? 1 : 0) })
        found.push({ rect: [left - gap - width, y, left - gap, y + height], size, gap, rank: rank + 2 + (gap > GAPS[0] ? 1 : 0) })
      })
      for (const x of [left - gap - width, right + gap]) {
        for (const y of [top - gap - height, bottom + gap]) found.push({ rect: [x, y, x + width, y + height], size, gap, rank: 3 })
      }
    }
  }
  return found.map(({ rect, size, gap, rank }) => ({
    rect,
    gap,
    rank,
    size,
    placement: { x: (rect[0] + rect[2]) / 2 - component.x, y: rect[3] - DESCENT * size - component.y, anchor: 'middle', size },
  }))
}

// What a label is judged against: every body, wire segment and other piece of text on the canvas.
function obstaclesOf(diagram) {
  const bodies = diagram.components.map((component) => ({ id: component.id, rect: bodyRectOf(component) }))
  const segments = diagram.wires.flatMap((wire) => segmentsOf(withoutRepeats(wire.points)))
  const texts = diagram.wires.flatMap((wire) => {
    const found = wireEndMarkers(wire)
      .filter((marker) => marker.label)
      .map((marker) => textRect(marker.label, marker.x, marker.y, marker.anchor, END_LABEL_SIZE))
    if (wire.label) {
      const [x, y] = wireLabelPosition(wire.points)
      found.push(textRect(wire.label, x, y, 'middle', WIRE_LABEL_SIZE))
    }
    return found
  })
  return { bodies, segments, texts }
}

const COST = { body: 500, label: 700, text: 500, wire: 90, closeness: 12, ambiguity: 10, size: 25, distance: 1.5, order: 4 }
const AMBIGUITY_MARGIN = 10

// How bad a label at `rect` is for `component`, how many parts or labels it overlaps, and whether it is hard to tell from another part's.
function judge(rect, component, ownBody, obstacles, otherLabels) {
  let cost = 0
  let overlaps = 0
  const own = rectGap(rect, ownBody)
  let nearestOther = Infinity
  for (const { id, rect: body } of obstacles.bodies) {
    if (id === component.id) continue
    if (overlapArea(rect, inflate(body, 0.5)) > 0) {
      cost += COST.body
      overlaps += 1
    }
    nearestOther = Math.min(nearestOther, rectGap(rect, body))
  }
  for (const label of otherLabels) {
    if (overlapArea(rect, inflate(label, 0.5)) > 0) {
      cost += COST.label
      overlaps += 1
    }
  }
  for (const text of obstacles.texts) {
    if (overlapArea(rect, text) > 0) {
      cost += COST.text
      overlaps += 1
    }
  }
  const box = inflate(rect, 40)
  for (const segment of obstacles.segments) {
    const [[ax, ay], [bx, by]] = segment
    if (Math.max(ax, bx) < box[0] || Math.min(ax, bx) > box[2] || Math.max(ay, by) < box[1] || Math.min(ay, by) > box[3]) continue
    if (segmentCrossesRect(segment, inflate(rect, 0.5))) cost += COST.wire
  }
  // A label has to read as its own component's: it must be nearer to that than to any other part.
  const margin = nearestOther - own
  const ambiguity = margin < AMBIGUITY_MARGIN ? (AMBIGUITY_MARGIN - margin) * COST.ambiguity : 0
  const crowding = nearestOther < 5 ? (5 - nearestOther) * COST.closeness : 0
  return { cost: cost + ambiguity + crowding, overlaps, ambiguous: ambiguity > 0 }
}

// How many labels are in trouble as they are now: on top of another part or label, or hard to tell from another part's.
export function labelProblems(diagram) {
  const obstacles = obstaclesOf(diagram)
  const labelled = diagram.components.filter(hasLabel)
  const rects = new Map(labelled.map((component) => [component.id, labelRectOf(component)]))
  return labelled
    .filter((component) => {
      const others = [...rects].filter(([id]) => id !== component.id).map(([, rect]) => rect)
      const verdict = judge(rects.get(component.id), component, bodyRectOf(component), obstacles, others)
      return verdict.overlaps > 0 || verdict.ambiguous
    })
    .map((component) => component.id)
}

// A place for every label, next to its component and clear of everything else where there is room. Returns
// `{ placements: { id: label }, problems: [id] }`, the latter being labels that still overlap something.
export function optimizeLabels(diagram) {
  const obstacles = obstaclesOf(diagram)
  const labelled = diagram.components.filter(hasLabel)
  const bodyOf = new Map(labelled.map((component) => [component.id, bodyRectOf(component)]))
  const crowding = (component) => labelled.filter((other) => other !== component && rectGap(bodyOf.get(component.id), bodyOf.get(other.id)) < 60).length
  const order = [...labelled].sort((a, b) => crowding(b) - crowding(a))
  const chosen = new Map()

  const place = (component) => {
    const others = [...chosen].filter(([id]) => id !== component.id).map(([, { rect }]) => rect)
    let best = null
    for (const candidate of candidatePlacements(component, bodyOf.get(component.id))) {
      const verdict = judge(candidate.rect, component, bodyOf.get(component.id), obstacles, others)
      const cost = verdict.cost + (LABEL_SIZE - candidate.size) * COST.size + candidate.gap * COST.distance + candidate.rank * COST.order
      if (!best || cost < best.cost) best = { ...candidate, cost, overlaps: verdict.overlaps }
    }
    return best
  }

  for (const component of order) chosen.set(component.id, place(component))
  // Each label is reconsidered against the others' final places until nothing moves.
  for (let round = 0; round < 4; round += 1) {
    let changed = false
    for (const component of order) {
      const better = place(component)
      if (better.cost < chosen.get(component.id).cost - 0.01) {
        chosen.set(component.id, better)
        changed = true
      }
    }
    if (!changed) break
  }
  const round = (value) => Math.round(value * 10) / 10
  return {
    placements: Object.fromEntries(
      [...chosen].map(([id, { placement }]) => [id, { x: round(placement.x), y: round(placement.y), anchor: placement.anchor, size: placement.size }]),
    ),
    problems: [...chosen].filter(([, { overlaps }]) => overlaps > 0).map(([id]) => id),
  }
}

// The circuit with these labels in place; components without an entry keep theirs.
export function withLabelPlacements(diagram, placements) {
  return { ...diagram, components: diagram.components.map((component) => (placements[component.id] ? { ...component, labelPlacement: placements[component.id] } : component)) }
}

// The circuit with every label back in its default place.
export function withDefaultLabels(diagram) {
  return {
    ...diagram,
    components: diagram.components.map((component) => {
      if (!component.labelPlacement) return component
      const rest = { ...component }
      delete rest.labelPlacement
      return rest
    }),
  }
}

export const validLabelPlacement = (placement) =>
  placement !== null &&
  typeof placement === 'object' &&
  Number.isFinite(placement.x) &&
  Number.isFinite(placement.y) &&
  ['start', 'middle', 'end'].includes(placement.anchor) &&
  Number.isFinite(placement.size) &&
  placement.size >= 4 &&
  placement.size <= 40

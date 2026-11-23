import { makeId } from '../shared/ids.js'
import { distanceToPolyline, samePoint, segmentsOf } from './geometry.js'
import { bodyRectOf } from './partGeometry.js'
import { buildModel, connectionSignature, layoutMetrics, layoutScore, nodeMover, pieceMove } from './rearrangeModel.js'
import { MAX_SHIFT, searchPositions } from './rearrangeSearch.js'
import { routeWire } from './wireRouting.js'
import { simplifyPoints } from './wireFollow.js'

export { connectionSignature, layoutMetrics, layoutScore }

// Rearranging a circuit: parts are moved across the grid so that fewer wires cross (every crossing is a hop to read past),
// wires are shorter and bend less, and parts keep clear of each other (see rearrangeSearch). The wires are then drawn again
// to fit, and nothing is connected or disconnected by it: `connectionSignature` is compared before and after, and the old
// circuit is kept if it differs.

// The circuit with the parts at `position`. `level` is how much of the wiring is drawn again: 0 only the wires whose ends
// moved apart, 1 also those that were just shifted along, 2 every wire of every net that has a part that moved.
function applyPositions(diagram, model, position, level = 0, force = new Set()) {
  const { components, pieces, follows } = model
  const deltas = new Map(components.map((component) => [component.id, [position.get(component.id)[0] - component.x, position.get(component.id)[1] - component.y]]))
  const moved = components.filter((component) => deltas.get(component.id).some(Boolean)).map((component) => component.id)
  if (!moved.length) return { diagram, moved }
  const nodeMove = nodeMover(follows, deltas)
  const moves = pieces.map((piece) => pieceMove(piece, nodeMove))
  const movedNets = new Set(pieces.filter((_, index) => moves[index].kind !== 'stays').map((piece) => piece.net))

  const entries = pieces.map((piece, index) => {
    const move = moves[index]
    const redraw = move.kind === 'redrawn' || force.has(index) || (level >= 1 && move.kind === 'shifted') || (level >= 2 && move.kind === 'stays' && movedNets.has(piece.net))
    const points = move.kind === 'shifted' ? piece.points.map(([x, y]) => [x + move.move[0], y + move.move[1]]) : piece.points
    return { piece, move, redraw, points, changed: move.kind !== 'stays' || redraw }
  })

  // Everything is in its final place before the wires that have to be drawn again are fitted around it.
  const bodies = components.map((component) => {
    const [dx, dy] = deltas.get(component.id)
    return { id: component.id, rect: bodyRectOf({ ...component, x: component.x + dx, y: component.y + dy }) }
  })
  for (const entry of entries) {
    entry.nodes = entry.redraw ? [entry.move.from, entry.move.to] : [entry.points[0], entry.points[entry.points.length - 1]]
    entry.segments = entry.redraw ? [] : segmentsOf(entry.points)
  }
  const span = ({ move }) => Math.abs(move.from[0] - move.to[0]) + Math.abs(move.from[1] - move.to[1])
  const redrawn = entries.filter((item) => item.redraw).sort((a, b) => span(a) - span(b))
  // Each wire is fitted around the others; a second round lets the first ones take the later ones into account.
  for (let round = 0; round < 3; round += 1) {
    for (const entry of redrawn) {
      const { piece, move } = entry
      const [first, second] = piece.nodes
      const foreign = entries.filter((other) => other.piece.net !== piece.net)
      const world = {
        otherSegments: foreign.flatMap((other) => other.segments),
        sameSegments: entries.filter((other) => other !== entry && other.piece.net === piece.net).flatMap((other) => other.segments),
        nodes: foreign.flatMap((other) => other.nodes),
        bodies,
        ownIds: new Set([first, second].filter((node) => node.kind === 'part').map((node) => node.id)),
      }
      const ends = [first, second].map((node, side) => {
        if (node.kind !== 'part') return { id: null, inside: false }
        const [left, top, right, bottom] = bodies.find((item) => item.id === node.id).rect
        const [x, y] = side === 0 ? move.from : move.to
        return { id: node.id, inside: x > left + INSIDE && x < right - INSIDE && y > top + INSIDE && y < bottom - INSIDE }
      })
      entry.points = routeWire(move.from, move.to, { exitA: first.exit, exitB: second.exit, world, ends }).points
      entry.segments = segmentsOf(entry.points)
    }
  }

  // Where a wire now ends on a wire of another net: those pieces have to be drawn differently.
  const contacts = []
  entries.forEach((entry, index) => {
    for (const end of [entry.points[0], entry.points[entry.points.length - 1]]) {
      entries.forEach((other, otherIndex) => {
        if (otherIndex !== index && other.piece.net !== entry.piece.net && distanceToPolyline(end, other.points) < 0.01) contacts.push([index, otherIndex])
      })
    }
  })

  // A wire that was cut is put back together when none of its pieces changed.
  const wires = []
  const byWire = new Map()
  for (const entry of entries) byWire.set(entry.piece.wire, [...(byWire.get(entry.piece.wire) ?? []), entry])
  for (const { wire } of model.clean) {
    const parts = byWire.get(wire)
    if (!parts || parts.every((entry) => !entry.changed)) {
      wires.push(wire)
      continue
    }
    // The pieces of a cut wire are joined again where they meet, so a bus is one wire as it was.
    const joined = []
    // Each piece is straightened on its own so that the point where wires join stays a point of the wire.
    for (const { piece, points: raw } of parts) {
      const points = simplifyPoints(raw)
      const last = joined[joined.length - 1]
      if (last && samePoint(last.points[last.points.length - 1], points[0])) {
        last.points = [...last.points, ...points.slice(1)]
        last.ends = { ...last.ends, ...piece.ends }
      } else joined.push({ piece, points, ends: { ...piece.ends } })
    }
    for (const { piece, points, ends } of joined) {
      const rest = { ...wire }
      delete rest.ends
      delete rest.label
      wires.push({
        ...rest,
        ...(piece.order === 0 && wire.label ? { label: wire.label } : {}),
        id: piece.id,
        points,
        ...(Object.keys(ends).length ? { ends } : {}),
      })
    }
  }
  const next = {
    ...diagram,
    components: components.map((component) => ({ ...component, x: component.x + deltas.get(component.id)[0], y: component.y + deltas.get(component.id)[1] })),
    wires,
  }
  return { diagram: next, moved, contacts }
}

// How far inside a part's body a wire end is to count as on its pins (a tube's) rather than at the edge of the symbol.
const INSIDE = 4

// The circuit with the parts at `position`, with the wires that end up touching others of another net drawn again until
// none does (or no more can be).
function placeParts(diagram, model, position, level) {
  const force = new Set()
  let result = applyPositions(diagram, model, position, level, force)
  for (let round = 0; round < 8 && result.contacts?.length; round += 1) {
    const before = force.size
    for (const pair of result.contacts) pair.forEach((index) => force.add(index))
    if (force.size === before) break
    result = applyPositions(diagram, model, position, level, force)
  }
  return result
}

// The searches tried, in order: how far parts may move, how much moving costs, and the random seed.
const ATTEMPTS = [
  { seed: 7, shift: MAX_SHIFT, weights: { move: 1 } },
  { seed: 8, shift: MAX_SHIFT, weights: { move: 1 } },
  { seed: 9, shift: MAX_SHIFT * 0.6, weights: { move: 2, bend: 5 } },
  { seed: 10, shift: MAX_SHIFT * 0.4, weights: { move: 2 } },
]
// A result this much better in score needs no further attempts.
const GOOD_ENOUGH = 0.4

// Moves the parts of `diagram` to make it easier to read. Returns `{ diagram, changed, moved, before, after, reason }`;
// `changed` is false (and `diagram` the original) when nothing better was found or the result could not be shown to be the same
// circuit. Several searches are tried within `timeBudget` milliseconds and the tidiest result kept.
export function rearrangeDiagram(diagram, { iterations, makeNewId = makeId, timeBudget = 8000, now = Date.now } = {}) {
  const before = layoutMetrics(diagram)
  const unchanged = (reason) => ({ diagram, changed: false, moved: 0, before, after: before, reason })
  let counter = 0
  const model = buildModel(diagram, () => `${makeNewId()}-${(counter += 1)}`)
  if (model.movable.size < 2) return unchanged('There are too few connected parts to rearrange.')
  const signature = connectionSignature(diagram)
  const scoreBefore = layoutScore(before)
  const startedAt = now()
  let unsafe = false
  let best = null
  for (const { seed, shift, weights } of ATTEMPTS) {
    if (best && now() - startedAt > timeBudget) break
    const position = searchPositions(model, seed, { iterations, shift, weights })
    for (const level of [0, 1]) {
      const { diagram: next, moved } = placeParts(diagram, model, position, level)
      if (!moved.length) break
      if (connectionSignature(next) !== signature) {
        unsafe = true
        continue
      }
      const after = layoutMetrics(next)
      if (layoutScore(after) < scoreBefore - 0.5 && (!best || layoutScore(after) < layoutScore(best.after))) best = { diagram: next, moved: moved.length, after }
      break
    }
    if (best && layoutScore(best.after) < scoreBefore * (1 - GOOD_ENOUGH)) break
  }
  if (best) return { diagram: best.diagram, changed: true, moved: best.moved, before, after: best.after, reason: '' }
  return unchanged(
    unsafe
      ? 'A rearrangement would have changed how parts are connected, so nothing was moved.'
      : 'No better arrangement found: the circuit is already as tidy as the search could make it.',
  )
}

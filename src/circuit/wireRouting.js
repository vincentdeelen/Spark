import { GRID_SIZE, snapToGrid } from '../shared/grid.js'
import { segmentCrossesRect } from './rects.js'
import { simplifyPoints } from './wireFollow.js'

// Draws a wire between two points as horizontal and vertical runs, choosing among the simple shapes (straight, one bend, a
// jog in the middle, with a short run out of each end) the one that is short, has few bends, crosses the fewest other wires
// and stays clear of parts. Used when parts are rearranged and their wires have to be drawn again.

const STUB = 2 * GRID_SIZE
// How far from its ends a wire may stray (a jog of up to six squares, and a run out of each end).
const REACH = 8 * GRID_SIZE
const MIN_OVERLAP = 0.5
const EPSILON = 0.01

const COST = { bend: 8, crossing: 25, sameNetCrossing: 6, overlap: 2000, touch: 5000, body: 600, exit: 15 }

const length = (points) => points.slice(1).reduce((sum, point, index) => sum + Math.abs(point[0] - points[index][0]) + Math.abs(point[1] - points[index][1]), 0)

// Every shape a wire could take between a and b.
function shapesBetween(a, b) {
  const aligned = a[0] === b[0] || a[1] === b[1]
  const shapes = aligned
    ? [[a, b]]
    : [
        [a, [b[0], a[1]], b],
        [a, [a[0], b[1]], b],
      ]
  const across = [(a[0] + b[0]) / 2, (3 * a[0] + b[0]) / 4, (a[0] + 3 * b[0]) / 4]
  const down = [(a[1] + b[1]) / 2, (3 * a[1] + b[1]) / 4, (a[1] + 3 * b[1]) / 4]
  for (let step = 1; step <= 6; step += 1) {
    for (const sign of [-1, 1]) {
      across.push(a[0] + sign * step * GRID_SIZE, b[0] + sign * step * GRID_SIZE)
      down.push(a[1] + sign * step * GRID_SIZE, b[1] + sign * step * GRID_SIZE)
    }
  }
  for (const x of new Set(across.map(snapToGrid))) shapes.push([a, [x, a[1]], [x, b[1]], b])
  for (const y of new Set(down.map(snapToGrid))) shapes.push([a, [a[0], y], [b[0], y], b])
  return shapes
}

// The candidate wires from a to b. `exitA` and `exitB` are the directions the wire leaves each end ([dx, dy]) or null.
export function candidateWires(a, b, exitA = null, exitB = null) {
  const found = new Map()
  for (const stubA of exitA ? [false, true] : [false]) {
    for (const stubB of exitB ? [false, true] : [false]) {
      const from = stubA ? [a[0] + exitA[0] * STUB, a[1] + exitA[1] * STUB] : a
      const to = stubB ? [b[0] + exitB[0] * STUB, b[1] + exitB[1] * STUB] : b
      for (const shape of shapesBetween(from, to)) {
        const points = simplifyPoints([a, ...(stubA ? [from] : []), ...shape, ...(stubB ? [to] : []), b])
        found.set(points.join(' '), points)
      }
    }
  }
  return [...found.values()]
}

const horizontal = ([p, q]) => p[1] === q[1]
const between = (value, a, b) => value > Math.min(a, b) + EPSILON && value < Math.max(a, b) - EPSILON

// How the segment relates to another: 'cross' (perpendicular, through both insides), 'overlap' (on the same line, sharing
// some length) or ''.
function relation(segment, other) {
  const [[ax, ay], [bx, by]] = segment
  const [[cx, cy], [dx, dy]] = other
  if (horizontal(segment) && horizontal(other)) {
    return ay === cy && Math.min(Math.max(ax, bx), Math.max(cx, dx)) - Math.max(Math.min(ax, bx), Math.min(cx, dx)) > MIN_OVERLAP ? 'overlap' : ''
  }
  if (!horizontal(segment) && !horizontal(other)) {
    return ax === cx && Math.min(Math.max(ay, by), Math.max(cy, dy)) - Math.max(Math.min(ay, by), Math.min(cy, dy)) > MIN_OVERLAP ? 'overlap' : ''
  }
  const [h, v] = horizontal(segment) ? [segment, other] : [other, segment]
  return between(v[0][0], h[0][0], h[1][0]) && between(h[0][1], v[0][1], v[1][1]) ? 'cross' : ''
}

// Whether a point is on an axis-aligned segment, its ends included.
const onSegment = ([x, y], [[ax, ay], [bx, by]]) =>
  x >= Math.min(ax, bx) - EPSILON && x <= Math.max(ax, bx) + EPSILON && y >= Math.min(ay, by) - EPSILON && y <= Math.max(ay, by) + EPSILON

// The cost of drawing `points`. `world` describes what else is on the canvas:
//   otherSegments  the segments of wires of other nets      sameSegments  those of the same net
//   nodes          points of other nets a wire must not touch (their wire ends and terminals)
//   bodies         [{ id, rect }] the parts; `ownIds` are the parts at either end, whose bodies only count if the end is not inside
export function wireCost(points, world, ends = []) {
  let cost = length(points) + COST.bend * Math.max(0, points.length - 2)
  const segments = points.slice(1).map((point, index) => [points[index], point])
  for (const segment of segments) {
    for (const other of world.otherSegments) {
      const kind = relation(segment, other)
      if (kind === 'cross') cost += COST.crossing
      else if (kind === 'overlap') cost += COST.overlap
    }
    for (const other of world.sameSegments) if (relation(segment, other) === 'cross') cost += COST.sameNetCrossing
    for (const node of world.nodes) if (onSegment(node, segment)) cost += COST.touch
    for (const { id, rect } of world.bodies) {
      if (world.ownIds.has(id) && ends.some((end) => end.id === id && end.inside)) continue
      if (segmentCrossesRect(segment, rect)) cost += COST.body
    }
  }
  return cost
}

// The best wire from a to b. `ends` lists, for each end, `{ id, inside }`: the part it is on and whether it sits inside that
// part's body (a tube's pin), so the wire may run over it.
export function routeWire(a, b, { exitA = null, exitB = null, world, ends = [] }) {
  // Only what is near the two ends can matter to the shapes tried.
  const near = [Math.min(a[0], b[0]) - REACH, Math.min(a[1], b[1]) - REACH, Math.max(a[0], b[0]) + REACH, Math.max(a[1], b[1]) + REACH]
  const inReach = (point) => point[0] >= near[0] && point[0] <= near[2] && point[1] >= near[1] && point[1] <= near[3]
  const segmentInReach = ([p, q]) => !(Math.max(p[0], q[0]) < near[0] || Math.min(p[0], q[0]) > near[2] || Math.max(p[1], q[1]) < near[1] || Math.min(p[1], q[1]) > near[3])
  const local = {
    ...world,
    otherSegments: world.otherSegments.filter(segmentInReach),
    sameSegments: world.sameSegments.filter(segmentInReach),
    nodes: world.nodes.filter(inReach),
    bodies: world.bodies.filter(({ rect }) => !(rect[2] < near[0] || rect[0] > near[2] || rect[3] < near[1] || rect[1] > near[3])),
  }
  let best = null
  for (const points of candidateWires(a, b, exitA, exitB)) {
    if (points.length < 2) continue
    let cost = wireCost(points, local, ends)
    const first = [Math.sign(points[1][0] - points[0][0]), Math.sign(points[1][1] - points[0][1])]
    const last = [Math.sign(points[points.length - 2][0] - points[points.length - 1][0]), Math.sign(points[points.length - 2][1] - points[points.length - 1][1])]
    if (exitA && (first[0] !== exitA[0] || first[1] !== exitA[1])) cost += COST.exit
    if (exitB && (last[0] !== exitB[0] || last[1] !== exitB[1])) cost += COST.exit
    if (!best || cost < best.cost) best = { points, cost }
  }
  return best ?? { points: [a, b], cost: Infinity }
}

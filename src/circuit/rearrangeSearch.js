import { GRID_SIZE, snapToGrid } from '../shared/grid.js'
import { areaRectOf, bodyRectOf } from './partGeometry.js'
import { nodeMover, pieceMove, simpleRoute } from './rearrangeModel.js'
import { inflate, overlapArea, segmentCrossesRect } from './rects.js'

// Moves the parts of a circuit to where its wires cross less, run shorter and bend less, by simulated annealing: a part is
// nudged (or lined up with something it is wired to) and the move is kept when the picture improves, now and then when it
// does not. The picture is the real wiring: a wire between two parts that moved alike is shifted as it is, one between parts
// that moved apart is a straight run or one bend, so the circuit as it is now costs exactly what it costs.

export const MAX_SHIFT = 20 * GRID_SIZE
const MIN_ITERATIONS = 3000
const MAX_ITERATIONS = 6000
// What a part's move may cost and still be undone at the end, in grid squares of wire.
const IDLE_MOVE = 1.5
const MARGIN = 4
const START_TEMPERATURE = 10
const END_TEMPERATURE = 0.3

// What each thing costs, in grid squares of wire.
const DEFAULT_WEIGHT = { length: 1, bend: 3, crossing: 25, throughPart: 40, overlap: 200, overlapArea: 0.5, move: 1 }

function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const crossesStrictly = ([a, b], [c, d]) => {
  const horizontalFirst = a[1] === b[1]
  if (horizontalFirst === (c[1] === d[1])) return false
  const [h, v] = horizontalFirst
    ? [
        [a, b],
        [c, d],
      ]
    : [
        [c, d],
        [a, b],
      ]
  const [x, y] = [v[0][0], h[0][1]]
  return x > Math.min(h[0][0], h[1][0]) && x < Math.max(h[0][0], h[1][0]) && y > Math.min(v[0][1], v[1][1]) && y < Math.max(v[0][1], v[1][1])
}

const segmentsOfPoints = (points) => points.slice(1).map((point, index) => [points[index], point])

// Returns where each part ends up: a Map of part id to [x, y].
export function searchPositions(model, seed, { iterations, shift = MAX_SHIFT, weights = {} } = {}) {
  const WEIGHT = { ...DEFAULT_WEIGHT, ...weights }
  const { components, pieces, follows, movable } = model
  const nextRandom = random(seed)
  const start = new Map(components.map((component) => [component.id, [component.x, component.y]]))
  const position = new Map(start)
  const deltas = new Map(components.map((component) => [component.id, [0, 0]]))
  const nodeMove = nodeMover(follows, deltas)
  const rectOffsets = (rectOf) => new Map(components.map((component) => [component.id, rectOf(component).map((value, index) => value - (index % 2 ? component.y : component.x))]))
  const bodyOffsets = rectOffsets(bodyRectOf)
  const areaOffsets = rectOffsets(areaRectOf)
  const rectAt = (offsets, id) => {
    const [x, y] = position.get(id)
    const [l, t, r, b] = offsets.get(id)
    return [x + l, y + t, x + r, y + b]
  }
  const bodyAt = (id) => rectAt(bodyOffsets, id)
  const areaAt = (id) => rectAt(areaOffsets, id)

  // The wires as they are drawn in the current arrangement.
  const shapeOf = (piece) => {
    const move = pieceMove(piece, nodeMove)
    let points = piece.points
    if (move.kind === 'shifted') points = piece.points.map(([x, y]) => [x + move.move[0], y + move.move[1]])
    if (move.kind === 'redrawn') points = simpleRoute(piece, move.from, move.to)
    const segments = segmentsOfPoints(points)
    const xs = points.map((point) => point[0])
    const ys = points.map((point) => point[1])
    return {
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      segments,
      length: segments.reduce((sum, [a, b]) => sum + Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 0),
      bends: Math.max(0, points.length - 2),
      ends: [points[0], points[points.length - 1]],
    }
  }
  const geometry = pieces.map(shapeOf)
  const piecesOf = new Map()
  pieces.forEach((piece, index) => piece.deps.forEach((id) => piecesOf.set(id, [...(piecesOf.get(id) ?? []), index])))
  const endParts = pieces.map((piece) => new Set(piece.nodes.filter((node) => node.kind === 'part').map((node) => node.id)))
  const ids = [...movable].filter((id) => piecesOf.has(id))

  const xs = components.map((component) => component.x)
  const ys = components.map((component) => component.y)
  const spread = [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
  // The room the parts may move into: nothing further left or up than the circuit reaches now, a little more to the right and down.
  const region = [Math.min(...xs), Math.min(...ys), Math.max(...xs) + Math.max(100, spread[0] * 0.25), Math.max(...ys) + Math.max(100, spread[1] * 0.25)]

  // The cost of everything that depends on where part `id` is.
  const partial = (id) => {
    const affected = piecesOf.get(id) ?? []
    const isAffected = new Set(affected)
    let cost = 0
    for (const index of affected) {
      const { segments, length, bends } = geometry[index]
      cost += (WEIGHT.length * length) / GRID_SIZE + WEIGHT.bend * bends
      const box = geometry[index].box
      for (const other of components) {
        if (endParts[index].has(other.id)) continue
        const body = bodyAt(other.id)
        if (body[2] < box[0] || body[0] > box[2] || body[3] < box[1] || body[1] > box[3]) continue
        if (segments.some((segment) => segmentCrossesRect(segment, body))) cost += WEIGHT.throughPart
      }
      geometry.forEach((second, otherIndex) => {
        if (otherIndex === index || (isAffected.has(otherIndex) && otherIndex < index) || pieces[otherIndex].net === pieces[index].net) return
        if (second.box[2] < box[0] || second.box[0] > box[2] || second.box[3] < box[1] || second.box[1] > box[3]) return
        for (const a of segments) for (const b of second.segments) if (crossesStrictly(a, b)) cost += WEIGHT.crossing
      })
    }
    const body = bodyAt(id)
    const area = inflate(areaAt(id), 2)
    geometry.forEach((shape, index) => {
      if (isAffected.has(index)) return
      // A wire end of another net inside the part's area would be taken as the part's.
      if (shape.ends.some(([x, y]) => x > area[0] && x < area[2] && y > area[1] && y < area[3])) cost += WEIGHT.overlap
      if (shape.box[2] < body[0] || shape.box[0] > body[2] || shape.box[3] < body[1] || shape.box[1] > body[3]) return
      if (shape.segments.some((segment) => segmentCrossesRect(segment, body))) cost += WEIGHT.throughPart
    })
    const mine = inflate(areaAt(id), MARGIN)
    for (const other of components) {
      if (other.id === id) continue
      const overlap = overlapArea(mine, inflate(areaAt(other.id), MARGIN))
      if (overlap > 0) cost += WEIGHT.overlap + overlap * WEIGHT.overlapArea
    }
    const [x, y] = position.get(id)
    const [x0, y0] = start.get(id)
    return cost + (WEIGHT.move * (Math.abs(x - x0) + Math.abs(y - y0))) / GRID_SIZE
  }

  // Moves part `id` to `next` if `accepts(change in cost)` says so; otherwise leaves it where it is.
  const move = (id, next, accepts) => {
    const [x, y] = position.get(id)
    const [x0, y0] = start.get(id)
    const affected = piecesOf.get(id)
    const before = partial(id)
    const previous = affected.map((index) => geometry[index])
    position.set(id, next)
    deltas.set(id, [next[0] - x0, next[1] - y0])
    // Every piece that follows this part, through a junction too, is drawn again.
    affected.forEach((index) => (geometry[index] = shapeOf(pieces[index])))
    if (accepts(partial(id) - before)) return
    position.set(id, [x, y])
    deltas.set(id, [x - x0, y - y0])
    affected.forEach((index, order) => (geometry[index] = previous[order]))
  }

  const total = iterations ?? Math.max(MIN_ITERATIONS, Math.min(MAX_ITERATIONS, ids.length * 170))
  const wiredTo = (id) => (piecesOf.get(id) ?? []).flatMap((index) => pieces[index].nodes.filter((node) => node.kind === 'part').map((node) => ({ node, own: node.id === id })))
  for (let step = 0; step < (ids.length > 1 ? total : 0); step += 1) {
    const temperature = START_TEMPERATURE * (END_TEMPERATURE / START_TEMPERATURE) ** (step / total)
    const id = ids[Math.floor(nextRandom() * ids.length)]
    const [x, y] = position.get(id)
    let next
    if (nextRandom() < 0.5) {
      const reach = Math.max(1, Math.round((8 * temperature) / START_TEMPERATURE))
      const jump = () => (Math.floor(nextRandom() * (2 * reach + 1)) - reach) * GRID_SIZE
      next = [x + jump(), y + (nextRandom() < 0.4 ? 0 : jump())]
    } else {
      // Straighten a wire: line a terminal of this part up with one it is wired to.
      const wired = wiredTo(id)
      const mine = wired.filter(({ own }) => own).map(({ node }) => node)
      const others = wired.filter(({ own }) => !own).map(({ node }) => node)
      if (!mine.length || !others.length) continue
      const from = mine[Math.floor(nextRandom() * mine.length)]
      const to = others[Math.floor(nextRandom() * others.length)]
      const [px, py] = position.get(to.id)
      const target = [px + to.offset[0] - from.offset[0], py + to.offset[1] - from.offset[1]]
      next = nextRandom() < 0.5 ? [target[0], y] : [x, target[1]]
    }
    const [x0, y0] = start.get(id)
    const within = (value, low, high, origin) => Math.min(high, origin + shift, Math.max(low, origin - shift, snapToGrid(value)))
    next = [within(next[0], region[0], region[2], x0), within(next[1], region[1], region[3], y0)]
    if (next[0] === x && next[1] === y) continue
    move(id, next, (change) => change <= 0 || nextRandom() < Math.exp(-change / temperature))
  }
  // Parts that moved without gaining anything much are put back where they were.
  for (const id of ids) {
    const [x0, y0] = start.get(id)
    const [x, y] = position.get(id)
    if (x !== x0 || y !== y0) move(id, [x0, y0], (change) => change <= IDLE_MOVE)
  }
  return position
}

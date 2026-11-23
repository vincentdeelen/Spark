import { snapToGrid } from '../shared/grid.js'
import { distanceToPolyline, distanceToSegment, segmentsOf, withoutRepeats } from './geometry.js'
import { wireHops } from './junctions.js'
import { boxContains, terminalsOf } from './partGeometry.js'
import { simplifyPoints } from './wireFollow.js'

// The picture of a circuit that rearranging works on. A wire that ends on another wire is first cut in two there, so every wire
// is a *piece* running between two *nodes*: a part's terminal (the wire end is at the part, or inside a tube's area), a
// junction (wire ends meeting) or a loose end. Pieces that share a junction or a terminal are one net.

const EPSILON = 0.01
const TERMINAL_REACH = 4

// What the circuit is judged by, before and after: a hop costs as much as two and a half grid squares of wire, a bend a third of one.
const SCORE = { hop: 25, length: 0.1, bend: 3 }

const keyOf = ([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
const unit = (from, to) => {
  const [dx, dy] = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1])]
  return dx || dy ? [dx, dy] : null
}

// The part a wire end belongs to: the one with a terminal at it, or for a part drawn without known terminals (a tube) the
// nearest one whose area the end is inside.
function attachmentIndex(components) {
  const terminals = new Map(components.map((component) => [component.id, terminalsOf(component)]))
  return (point) => {
    let found = null
    for (const component of components) {
      for (const terminal of terminals.get(component.id)) {
        const distance = Math.hypot(point[0] - terminal.point[0], point[1] - terminal.point[1])
        if (distance <= TERMINAL_REACH && (!found || distance < found.distance)) found = { component, distance }
      }
    }
    if (found) return found.component
    return components
      .filter((component) => !terminals.get(component.id).length && boxContains(component, point))
      .sort((a, b) => Math.hypot(a.x - point[0], a.y - point[1]) - Math.hypot(b.x - point[0], b.y - point[1]))[0]
  }
}

// Which parts' terminals each group of connected wires reaches, as sorted text. Equal before and after means the same circuit.
export function connectionSignature(diagram) {
  const wires = diagram.wires.map((wire) => ({ wire, points: withoutRepeats(wire.points) })).filter(({ points }) => points.length > 1)
  const attach = attachmentIndex(diagram.components)
  const parent = wires.map((_, index) => index)
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])))
  const join = (a, b) => (parent[find(a)] = find(b))
  const ends = wires.flatMap(({ wire, points }, index) =>
    [
      [points[0], 'start'],
      [points[points.length - 1], 'end'],
    ].map(([point, end]) => ({ index, point, marker: wire.ends?.[end] })),
  )
  const owners = new Map()
  for (const { index, point } of ends) {
    wires.forEach(({ points }, other) => {
      if (other !== index && distanceToPolyline(point, points) < EPSILON) join(index, other)
    })
    const component = attach(point)
    if (!component) continue
    const key = `${component.id}@${keyOf([point[0] - component.x, point[1] - component.y])}`
    if (owners.has(key)) join(index, owners.get(key))
    else owners.set(key, index)
  }
  const groups = new Map()
  const add = (index, text) => groups.set(find(index), [...(groups.get(find(index)) ?? []), text])
  for (const { index, point, marker } of ends) {
    const component = attach(point)
    if (component) add(index, `${component.id}@${keyOf([point[0] - component.x, point[1] - component.y])}`)
    if (marker) add(index, `off-page:${marker.marker ?? ''}:${marker.label ?? ''}`)
  }
  return [...groups.values()]
    .map((texts) => [...new Set(texts)].sort().join('|'))
    .sort()
    .join('\n')
}

// How tidy a circuit is: the hops its wires make, their total length and their bends.
export function layoutMetrics(diagram) {
  const hops = Object.values(wireHops(diagram)).reduce((sum, list) => sum + list.length, 0)
  let length = 0
  let bends = 0
  for (const wire of diagram.wires) {
    const points = simplifyPoints(withoutRepeats(wire.points))
    length += segmentsOf(points).reduce((sum, [a, b]) => sum + Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 0)
    bends += Math.max(0, points.length - 2)
  }
  return { hops, length: Math.round(length), bends }
}
export const layoutScore = ({ hops, length, bends }) => hops * SCORE.hop + length * SCORE.length + bends * SCORE.bend

// --- The model: wires cut into pieces between nodes, and the nets they form.

// The wire cut where other wires end on it; each piece is [points, ...].
function cutAtJunctions(points, endPoints) {
  const cuts = new Map()
  for (const point of endPoints) {
    if ([points[0], points[points.length - 1]].some((end) => Math.hypot(point[0] - end[0], point[1] - end[1]) < EPSILON)) continue
    const index = segmentsOf(points).findIndex(([a, b]) => distanceToSegment(point, a, b) < EPSILON)
    if (index >= 0) cuts.set(keyOf(point), { index, point })
  }
  if (!cuts.size) return [points]
  const pieces = []
  let current = [points[0]]
  segmentsOf(points).forEach(([a, b], index) => {
    const here = [...cuts.values()]
      .filter((cut) => cut.index === index)
      .sort((p, q) => Math.hypot(p.point[0] - a[0], p.point[1] - a[1]) - Math.hypot(q.point[0] - a[0], q.point[1] - a[1]))
    for (const { point } of here) {
      current.push(point)
      pieces.push(current)
      current = [point]
    }
    current.push(b)
  })
  pieces.push(current)
  return pieces.map((piece) => withoutRepeats(piece)).filter((piece) => piece.length > 1)
}

export function buildModel(diagram, newId) {
  const components = diagram.components
  const attach = attachmentIndex(components)
  const clean = diagram.wires.map((wire) => ({ wire, points: withoutRepeats(wire.points) }))
  const usable = clean.filter(({ points }) => points.length > 1)
  const endPoints = usable.flatMap(({ points }, index) => [
    { index, point: points[0] },
    { index, point: points[points.length - 1] },
  ])

  const pieces = []
  usable.forEach(({ wire, points }, index) => {
    const parts = cutAtJunctions(
      points,
      endPoints.filter((end) => end.index !== index && distanceToPolyline(end.point, points) < EPSILON).map((end) => end.point),
    )
    parts.forEach((part, order) => {
      const ends = {}
      if (order === 0 && wire.ends?.start) ends.start = wire.ends.start
      if (order === parts.length - 1 && wire.ends?.end) ends.end = wire.ends.end
      pieces.push({ wire, order, count: parts.length, points: part, id: order === 0 ? wire.id : newId(), ends })
    })
  })

  const nodeOf = (point, from) => {
    const component = attach(point)
    return component
      ? {
          kind: 'part',
          id: component.id,
          offset: [point[0] - component.x, point[1] - component.y],
          point,
          exit: from ? unit(point, from) : null,
          key: `${component.id}@${keyOf([point[0] - component.x, point[1] - component.y])}`,
        }
      : { kind: 'loose', point, key: `at:${keyOf(point)}` }
  }
  for (const piece of pieces) {
    const [first, last] = [piece.points[0], piece.points[piece.points.length - 1]]
    piece.nodes = [nodeOf(first, piece.points[1]), nodeOf(last, piece.points[piece.points.length - 2])]
    piece.segments = segmentsOf(piece.points)
  }
  // Loose ends that meet are a junction.
  const meeting = new Map()
  for (const piece of pieces) for (const node of piece.nodes) if (node.kind === 'loose') meeting.set(node.key, (meeting.get(node.key) ?? 0) + 1)
  for (const piece of pieces) for (const node of piece.nodes) if (node.kind === 'loose' && meeting.get(node.key) > 1) node.kind = 'junction'

  // Nets: pieces that share a junction or a terminal.
  const parent = pieces.map((_, index) => index)
  const find = (index) => (parent[index] === index ? index : (parent[index] = find(parent[index])))
  const seen = new Map()
  pieces.forEach((piece, index) =>
    piece.nodes.forEach((node) => {
      if (node.kind === 'loose') return
      if (seen.has(node.key)) parent[find(index)] = find(seen.get(node.key))
      else seen.set(node.key, index)
    }),
  )
  const netIds = new Map()
  pieces.forEach((piece, index) => {
    const root = find(index)
    if (!netIds.has(root)) netIds.set(root, netIds.size)
    piece.net = netIds.get(root)
  })
  const nets = Array.from({ length: netIds.size }, () => ({ terminals: new Map() }))
  for (const piece of pieces) {
    for (const node of piece.nodes) {
      if (node.kind === 'part' && !nets[piece.net].terminals.has(node.key))
        nets[piece.net].terminals.set(node.key, { id: node.id, dx: node.offset[0], dy: node.offset[1], exit: node.exit })
    }
  }
  const partsOfNet = nets.map((net) => new Set([...net.terminals.values()].map((terminal) => terminal.id)))
  const follows = junctionFollowers(pieces)
  for (const piece of pieces) {
    piece.deps = new Set(piece.nodes.flatMap((node) => (node.kind === 'part' ? [node.id] : node.kind === 'junction' ? [...follows.get(node.key)] : [])))
    piece.length = pieceLength(piece.points)
  }
  const movable = new Set(pieces.filter((piece) => partsOfNet[piece.net].size > 1).flatMap((piece) => [...piece.deps]))
  return { components, pieces, clean, partsOfNet, follows, movable }
}

const pieceLength = (points) => points.slice(1).reduce((sum, point, index) => sum + Math.abs(point[0] - points[index][0]) + Math.abs(point[1] - points[index][1]), 0)

// The parts each junction moves with: the parts its wires lead to or, for a junction that only joins other junctions, the
// parts those follow.
function junctionFollowers(pieces) {
  const follows = new Map()
  const neighbours = new Map()
  for (const piece of pieces) {
    piece.nodes.forEach((node, side) => {
      if (node.kind !== 'junction') return
      follows.set(node.key, follows.get(node.key) ?? new Set())
      const other = piece.nodes[1 - side]
      if (other.kind === 'part') follows.get(node.key).add(other.id)
      else if (other.kind === 'junction') neighbours.set(node.key, [...(neighbours.get(node.key) ?? []), other.key])
    })
  }
  for (let pass = 0; pass < 12; pass += 1) {
    for (const [key, others] of neighbours) {
      if (follows.get(key).size) continue
      for (const other of others) for (const id of follows.get(other)) follows.get(key).add(id)
    }
  }
  return follows
}

// How a node moves when parts move by `deltas` (a Map of part id to [dx, dy]): a terminal with its part, a junction with the
// average of the parts it follows, and a loose end not by itself (null: it goes with the piece's other end).
export function nodeMover(follows, deltas) {
  return (node) => {
    if (node.kind === 'part') return deltas.get(node.id) ?? [0, 0]
    if (node.kind !== 'junction') return null
    const parts = [...follows.get(node.key)]
    if (!parts.length) return [0, 0]
    const sum = parts.reduce(([x, y], id) => [x + (deltas.get(id) ?? [0, 0])[0], y + (deltas.get(id) ?? [0, 0])[1]], [0, 0])
    return [snapToGrid(sum[0] / parts.length), snapToGrid(sum[1] / parts.length)]
  }
}

const isZero = (move) => !move || (!move[0] && !move[1])
const shiftPoint = (point, [dx, dy]) => [point[0] + dx, point[1] + dy]

// What happens to a piece when its nodes move: it stays, is shifted along as it is (both ends moved alike, or one end is loose),
// or has to be drawn again between its moved ends. `from` and `to` are the new places of its ends.
export function pieceMove(piece, nodeMove) {
  const [a, b] = piece.nodes
  const [moveA, moveB] = [nodeMove(a), nodeMove(b)]
  if (isZero(moveA) && isZero(moveB)) return { kind: 'stays', from: a.point, to: b.point }
  if (!moveA || !moveB || (moveA[0] === moveB[0] && moveA[1] === moveB[1])) {
    const move = moveA ?? moveB
    return { kind: 'shifted', move, from: shiftPoint(a.point, move), to: shiftPoint(b.point, move) }
  }
  return { kind: 'redrawn', from: shiftPoint(a.point, moveA), to: shiftPoint(b.point, moveB) }
}

// A piece drawn again as a straight run or one bend, leaving its first end the way it left it: the shape the search assumes.
export function simpleRoute(piece, from, to) {
  if (from[0] === to[0] || from[1] === to[1]) return [from, to]
  const [exitA, exitB] = [piece.nodes[0].exit, piece.nodes[1].exit]
  const horizontalFirst = exitA ? exitA[1] === 0 : exitB ? exitB[1] !== 0 : true
  return [from, horizontalFirst ? [to[0], from[1]] : [from[0], to[1]], to]
}

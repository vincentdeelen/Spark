import { snapToGrid } from '../shared/grid.js'
import { samePoint } from './geometry.js'
import { boxContains } from './partGeometry.js'

// Keeps wires attached to a component while it is moved: each wire end on the component moves with it, and the wire
// is reshaped so it stays made of horizontal and vertical runs.

const horizontal = (a, b) => a[1] === b[1]
const vertical = (a, b) => a[0] === b[0]

// The wire's corners only: repeated points and points in the middle of a straight run are dropped.
export function simplifyPoints(points) {
  const kept = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]))
  return kept.filter((point, index) => {
    if (index === 0 || index === kept.length - 1) return true
    const [before, after] = [kept[index - 1], kept[index + 1]]
    return !((horizontal(before, point) && horizontal(point, after)) || (vertical(before, point) && vertical(point, after)))
  })
}

// The ends of wires that sit on any of the components: { wireId: ['start' | 'end', ...] }.
export function attachedEnds(diagram, componentIds) {
  const components = diagram.components.filter((component) => componentIds.includes(component.id))
  const attached = {}
  for (const wire of diagram.wires) {
    const ends = [
      ['start', wire.points[0]],
      ['end', wire.points[wire.points.length - 1]],
    ]
      .filter(([, point]) => components.some((component) => boxContains(component, point)))
      .map(([key]) => key)
    if (ends.length) attached[wire.id] = ends
  }
  return attached
}

// Moves the first point by (dx, dy), bending the wire so its runs stay horizontal and vertical. The first run keeps its
// direction, so a wire still leaves the component the way it did.
function moveStart(points, dx, dy) {
  const [start, next] = points
  const moved = [start[0] + dx, start[1] + dy]
  if (points.length === 2) {
    if (horizontal(start, next) && dy) {
      const middle = snapToGrid((moved[0] + next[0]) / 2)
      return [moved, [middle, moved[1]], [middle, next[1]], next]
    }
    if (vertical(start, next) && dx) {
      const middle = snapToGrid((moved[1] + next[1]) / 2)
      return [moved, [moved[0], middle], [next[0], middle], next]
    }
    return [moved, next]
  }
  if (horizontal(start, next)) return [moved, [next[0], next[1] + dy], ...points.slice(2)]
  if (vertical(start, next)) return [moved, [next[0] + dx, next[1]], ...points.slice(2)]
  return [moved, ...points.slice(1)]
}

// The wires after the attached ends moved by (dx, dy). A wire attached at both ends moves as a whole.
export function followMove(wires, attached, dx, dy) {
  if (!dx && !dy) return wires
  return wires.map((wire) => {
    const ends = attached[wire.id]
    if (!ends) return wire
    if (ends.length === 2) return { ...wire, points: wire.points.map(([x, y]) => [x + dx, y + dy]) }
    const points = simplifyPoints(wire.points)
    if (points.length < 2) return wire
    const reshaped = ends[0] === 'start' ? moveStart(points, dx, dy) : moveStart([...points].reverse(), dx, dy).reverse()
    return { ...wire, points: simplifyPoints(reshaped) }
  })
}

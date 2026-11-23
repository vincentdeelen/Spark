import { samePoint } from './geometry.js'

export function validRegion(region) {
  return (
    Array.isArray(region) && region.length === 4 && region.every((value) => Number.isFinite(value) && Math.abs(value) <= 100000) && region[2] > region[0] && region[3] > region[1]
  )
}

export function pointInRegion([x, y], [left, top, right, bottom]) {
  return x >= left && x <= right && y >= top && y <= bottom
}

export function wireLabelPosition(points) {
  const start = points[0]
  const end = points.find((point) => point[0] !== start[0] || point[1] !== start[1]) || start
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 5]
}

function clipSegment(a, b, [left, top, right, bottom]) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  let start = 0
  let end = 1
  for (const [p, q] of [
    [-dx, a[0] - left],
    [dx, right - a[0]],
    [-dy, a[1] - top],
    [dy, bottom - a[1]],
  ]) {
    if (p === 0 && q < 0) return null
    if (p < 0) start = Math.max(start, q / p)
    if (p > 0) end = Math.min(end, q / p)
    if (start > end) return null
  }
  const point = (t) => [a[0] + t * dx, a[1] + t * dy]
  const first = point(start)
  const last = point(end)
  return first[0] === last[0] && first[1] === last[1] ? null : [first, last]
}

export function clipWire(points, region) {
  const fragments = []
  for (let i = 1; i < points.length; i += 1) {
    const segment = clipSegment(points[i - 1], points[i], region)
    if (!segment) continue
    const previous = fragments[fragments.length - 1]
    const last = previous?.[previous.length - 1]
    if (last && last[0] === segment[0][0] && last[1] === segment[0][1]) previous.push(segment[1])
    else fragments.push(segment)
  }
  return fragments
}

export function exportSection(diagram, region, makeId) {
  const components = diagram.components.filter((item) => pointInRegion([item.x, item.y], region))
  const componentIds = new Set(components.map((item) => item.id))
  const usedIds = new Set([...diagram.components, ...diagram.wires].map((item) => item.id))
  const wires = []
  for (const wire of diagram.wires) {
    clipWire(wire.points, region).forEach((points, index) => {
      let id = wire.id
      if (index) {
        do {
          id = makeId()
        } while (usedIds.has(id))
        usedIds.add(id)
      }
      // An end marker stays only on a piece that still ends where the wire did.
      const keptEnds = Object.fromEntries(
        Object.entries(wire.ends || {}).filter(([key]) =>
          key === 'start' ? samePoint(points[0], wire.points[0]) : samePoint(points[points.length - 1], wire.points[wire.points.length - 1]),
        ),
      )
      const plain = { ...wire }
      delete plain.ends
      wires.push({
        ...plain,
        ...(Object.keys(keptEnds).length ? { ends: keptEnds } : {}),
        id,
        points,
        ...(wire.componentIds ? { componentIds: wire.componentIds.filter((item) => componentIds.has(item)) } : {}),
      })
    })
  }
  return { ...diagram, components, wires, viewRegion: [...region] }
}

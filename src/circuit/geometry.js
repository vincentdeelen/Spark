// Plane geometry on [x, y] points: distances to segments and polylines, and wire clean-up. No knowledge of circuits.

export const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1]
export const nearPoint = (a, b, tolerance) => Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance

// The point of the segment a–b nearest to `point`.
export function closestPointOnSegment(point, [ax, ay], [bx, by]) {
  const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point[0] - ax) * (bx - ax) + (point[1] - ay) * (by - ay)) / lengthSquared)) : 0
  return [ax + t * (bx - ax), ay + t * (by - ay)]
}

export function distanceToSegment(point, a, b) {
  const [x, y] = closestPointOnSegment(point, a, b)
  return Math.hypot(point[0] - x, point[1] - y)
}

export const distanceToPolyline = (point, points) => Math.min(...segmentsOf(points).map(([a, b]) => distanceToSegment(point, a, b)))

// Whether `point` lies exactly on the segment a–b.
export function pointOnSegment([x, y], [ax, ay], [bx, by]) {
  return (x - ax) * (by - ay) === (y - ay) * (bx - ax) && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)
}

// The segments of a polyline as [from, to] pairs.
export const segmentsOf = (points) => points.slice(1).map((point, index) => [points[index], point])

// The points without consecutive repeats, so zero-length segments do not count as segments or bends.
export const withoutRepeats = (points) => points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]))

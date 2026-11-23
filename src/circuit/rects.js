// Axis-aligned rectangles as [left, top, right, bottom], and the few questions the layout code asks about them.

const INSET = 0.01

export const inflate = (rect, amount) => [rect[0] - amount, rect[1] - amount, rect[2] + amount, rect[3] + amount]

export const rectCentre = (rect) => [(rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2]

// The area the two rectangles share (0 when they only touch).
export function overlapArea(a, b) {
  const width = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const height = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  return width > 0 && height > 0 ? width * height : 0
}

// The distance between the rectangles (0 when they touch or overlap).
export function rectGap(a, b) {
  return Math.hypot(Math.max(a[0] - b[2], b[0] - a[2], 0), Math.max(a[1] - b[3], b[1] - a[3], 0))
}

// Whether a segment runs through the inside of a rectangle; running along its edge or ending on it does not count.
export function segmentCrossesRect([[ax, ay], [bx, by]], [left, top, right, bottom]) {
  const [l, t, r, b] = [left + INSET, top + INSET, right - INSET, bottom - INSET]
  if (l >= r || t >= b) return false
  let enter = 0
  let leave = 1
  const dx = bx - ax
  const dy = by - ay
  for (const [direction, distance] of [
    [-dx, ax - l],
    [dx, r - ax],
    [-dy, ay - t],
    [dy, b - ay],
  ]) {
    if (direction === 0) {
      if (distance < 0) return false
    } else {
      const ratio = distance / direction
      if (direction < 0) enter = Math.max(enter, ratio)
      else leave = Math.min(leave, ratio)
    }
  }
  return enter < leave
}

// The bounds of a rectangle turned by `degrees` around the origin.
export function rotatedBounds({ x, y, width, height }, degrees) {
  const angle = (degrees * Math.PI) / 180
  const corners = [
    [x, y],
    [x + width, y],
    [x, y + height],
    [x + width, y + height],
  ].map(([cx, cy]) => [cx * Math.cos(angle) - cy * Math.sin(angle), cx * Math.sin(angle) + cy * Math.cos(angle)])
  const xs = corners.map((corner) => corner[0])
  const ys = corners.map((corner) => corner[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

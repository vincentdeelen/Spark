import { selectionBoxOf } from './partGeometry.js'

// The drawing area starts at 1000×700 and grows to the right and down to hold whatever is drawn, plus room around it.
// While a wire is drawn and the cursor reaches the right or bottom edge, the area grows ahead of the cursor, so a wire can
// be run off the edge and the grid extends with it. It never grows left or up (unless a loaded drawing already reaches
// there), so the drawing never shifts under the cursor.
export const BASE_EXTENT = [0, 0, 1000, 700]
export const CONTENT_MARGIN = 100
export const GROW_AHEAD = 200
// How close to the right or bottom edge, in drawing units, the cursor has to come for the area to grow.
export const GROW_EDGE = 40
const STEP = 100

const down = (value) => Math.floor(value / STEP) * STEP
const up = (value) => Math.ceil(value / STEP) * STEP

function contentBounds(diagram) {
  const points = diagram.wires.flatMap((wire) => wire.points)
  for (const component of diagram.components) {
    const { box } = selectionBoxOf(component)
    // Turned boxes are covered by their largest reach in every direction.
    const reach = Math.max(Math.abs(box.x), Math.abs(box.y), Math.abs(box.x + box.width), Math.abs(box.y + box.height))
    points.push([component.x - reach, component.y - reach], [component.x + reach, component.y + reach])
  }
  if (!points.length) return null
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// [left, top, right, bottom] of the drawing area; `growPoint` is the cursor while a wire is drawn. Once the cursor is at
// or past the edge it keeps the area grown, so the area does not flicker back as the cursor moves on.
export function canvasExtent(diagram, growPoint) {
  let [left, top, right, bottom] = BASE_EXTENT
  const content = contentBounds(diagram)
  if (content) {
    if (content[0] < left) left = down(content[0] - CONTENT_MARGIN)
    if (content[1] < top) top = down(content[1] - CONTENT_MARGIN)
    right = Math.max(right, up(content[2] + CONTENT_MARGIN))
    bottom = Math.max(bottom, up(content[3] + CONTENT_MARGIN))
  }
  if (growPoint) {
    if (growPoint[0] >= right - GROW_EDGE) right = up(growPoint[0] + GROW_AHEAD)
    if (growPoint[1] >= bottom - GROW_EDGE) bottom = up(growPoint[1] + GROW_AHEAD)
  }
  return [left, top, right, bottom]
}

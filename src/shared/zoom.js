// Size of a component relative to the standard symbol.
export const MIN_SCALE = 0.1
export const MAX_SCALE = 10

export const MIN_ZOOM = 10
export const MAX_ZOOM = 500
export const DEFAULT_ZOOM = 100

// Steps get coarser as the zoom grows so reaching either end takes a few clicks.
const ZOOM_STEPS = [10, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500]

export const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

export const zoomIn = (value) => ZOOM_STEPS.find((step) => step > value) ?? MAX_ZOOM

export const zoomOut = (value) => [...ZOOM_STEPS].reverse().find((step) => step < value) ?? MIN_ZOOM

// The size a component gets when its resize handle is dragged from `start` to `point` (diagram coordinates) around the
// component's centre: the symbol grows in proportion to the handle's distance from the centre, to hundredths.
export function resizedScale(startScale, center, start, point) {
  const startDistance = Math.hypot(start[0] - center[0], start[1] - center[1])
  if (startDistance < 1) return startScale
  const scale = (startScale * Math.hypot(point[0] - center[0], point[1] - center[1])) / startDistance
  return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale)) * 100) / 100
}

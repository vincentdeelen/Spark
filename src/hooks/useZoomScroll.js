import { useLayoutEffect, useRef } from 'react'

// For a scrolling area whose content is as large as the zoom makes it: zooming keeps the middle of the view in place.
// Spread `scrollProps` on the scrolling element and zoom with `changeZoom` (a setter or an updater).
export default function useZoomScroll(zoom, setZoom) {
  const ref = useRef(null)
  const center = useRef([0.5, 0.5])
  const remember = () => {
    const area = ref.current
    if (area?.scrollWidth && area.scrollHeight)
      center.current = [(area.scrollLeft + area.clientWidth / 2) / area.scrollWidth, (area.scrollTop + area.clientHeight / 2) / area.scrollHeight]
  }
  useLayoutEffect(() => {
    const area = ref.current
    if (!area) return
    area.scrollLeft = center.current[0] * area.scrollWidth - area.clientWidth / 2
    area.scrollTop = center.current[1] * area.scrollHeight - area.clientHeight / 2
  }, [zoom])
  return {
    scrollProps: { ref, onScroll: remember },
    changeZoom: (next) => {
      remember()
      setZoom(next)
    },
  }
}

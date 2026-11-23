import { snapToGrid as snap } from '../shared/grid.js'

// Finds long horizontal/vertical dark runs, merging adjacent pixels of the same line.
export function detectStraightWires(imageData, makeId, { threshold = 140, minimumRun = 45 } = {}) {
  const { data, width, height } = imageData
  const runs = []
  for (const vertical of [false, true]) {
    const across = vertical ? width : height
    const along = vertical ? height : width
    let active = []
    for (let row = 0; row < across; row += 1) {
      const current = []
      let start = -1
      for (let col = 0; col <= along; col += 1) {
        const x = vertical ? row : col
        const y = vertical ? col : row
        const index = (y * width + x) * 4
        const dark = col < along && data[index + 3] > 128 && data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114 < threshold
        if (dark && start < 0) start = col
        if (!dark && start >= 0) {
          if (col - start >= minimumRun) {
            const end = col - 1
            const match = active.find((run) => !run.used && Math.abs(run.start - start) <= 4 && Math.abs(run.end - end) <= 4)
            if (match) {
              match.used = true
              match.last = row
              current.push(match)
            } else current.push({ start, end, first: row, last: row, vertical, used: true })
          }
          start = -1
        }
      }
      active.filter((run) => !run.used).forEach((run) => runs.push(run))
      current.forEach((run) => {
        run.used = false
      })
      active = current
    }
    runs.push(...active)
  }
  const seen = new Set()
  const wires = []
  for (const run of runs) {
    // Broad filled shapes are not likely to be wires.
    if (run.last - run.first > 8) continue
    const cross = snap((run.first + run.last) / 2)
    const start = snap(run.start)
    const end = snap(run.end)
    if (end - start < (minimumRun < 40 ? 20 : 40)) continue
    const points = run.vertical
      ? [
          [cross, start],
          [cross, end],
        ]
      : [
          [start, cross],
          [end, cross],
        ]
    const key = JSON.stringify(points)
    if (seen.has(key)) continue
    seen.add(key)
    if (wires.length === 500) return { wires, truncated: true }
    wires.push({ id: makeId(), points })
  }
  return { wires, truncated: false }
}

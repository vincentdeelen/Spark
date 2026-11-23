// Pure operations on the project's circuits (documents), their tabs (views) and the BOM rows tied to each circuit.
// A circuit's own view shares its id; linked section views point at it through `documentId`.

export const isCircuitView = (view) => !view.section

// `name`, or `name (2)`, `name (3)`... when another sheet already uses it.
export function uniqueName(name, taken) {
  const names = new Set(taken)
  if (!names.has(name)) return name
  const base = name.replace(/ \(\d+\)$/, '')
  let number = 2
  while (names.has(`${base} (${number})`)) number += 1
  return `${base} (${number})`
}

// Renames a tab; renaming a circuit's own tab renames the circuit too.
export function renameView({ sheets, views }, viewId, rawName) {
  const name = rawName.trim().slice(0, 1000)
  const view = views.find((item) => item.id === viewId)
  if (!view || !name || name === view.name) return null
  return {
    views: views.map((item) => (item.id === viewId ? { ...item, name } : item)),
    sheets: isCircuitView(view) ? sheets.map((sheet) => (sheet.id === view.documentId ? { ...sheet, name } : sheet)) : sheets,
  }
}

// Moves a tab one place left (-1) or right (+1).
export function moveView(views, viewId, offset) {
  const index = views.findIndex((item) => item.id === viewId)
  const target = index + offset
  if (index < 0 || target < 0 || target >= views.length) return null
  const next = [...views]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

// What deleting a tab removes: a section view only itself; a circuit also every linked view of it and its BOM rows.
// Null when it is the last circuit, which cannot be deleted.
export function removeView({ sheets, views, bom }, viewId) {
  const view = views.find((item) => item.id === viewId)
  if (!view) return null
  const removesCircuit = isCircuitView(view)
  if (removesCircuit && sheets.length <= 1) return null
  const gone = (item) => item.id === viewId || (removesCircuit && item.documentId === view.documentId)
  const remaining = views.filter((item) => !gone(item))
  const index = views.findIndex((item) => item.id === viewId)
  // The tab that takes its place: the nearest remaining tab to the right, else to the left.
  const neighbour = [...views.slice(index + 1), ...views.slice(0, index).reverse()].find((item) => !gone(item))
  return {
    sheets: removesCircuit ? sheets.filter((sheet) => sheet.id !== view.documentId) : sheets,
    views: remaining,
    bom: removesCircuit ? bom.filter((item) => item.documentId !== view.documentId) : bom,
    nextActiveId: neighbour?.id,
    linkedViews: removesCircuit ? views.filter((item) => item.section && item.documentId === view.documentId).length : 0,
    bomRows: removesCircuit ? bom.filter((item) => item.documentId === view.documentId).length : 0,
  }
}

// A copy of a tab placed right after it. A circuit is copied with its drawing (`diagram`, the current one) and BOM rows;
// a section view becomes a second view of the same circuit and region.
export function duplicateView({ views, bom }, viewId, diagram, makeId) {
  const view = views.find((item) => item.id === viewId)
  if (!view) return null
  const id = makeId()
  const name = uniqueName(
    `${view.name} copy`,
    views.map((item) => item.name),
  )
  const copy = isCircuitView(view) ? { id, documentId: id, name, region: null } : { ...view, id, name }
  const index = views.indexOf(view)
  return {
    views: [...views.slice(0, index + 1), copy, ...views.slice(index + 1)],
    sheet: isCircuitView(view) ? { id, name, diagram: structuredClone(diagram) } : null,
    bom: isCircuitView(view) ? [...bom, ...bom.filter((item) => item.documentId === view.documentId).map((item) => ({ ...item, documentId: id }))] : bom,
    viewId: id,
  }
}

// Inserts a new circuit's tab right after `afterViewId` (or at the end).
export function insertViewAfter(views, afterViewId, view) {
  const index = views.findIndex((item) => item.id === afterViewId)
  return index < 0 ? [...views, view] : [...views.slice(0, index + 1), view, ...views.slice(index + 1)]
}

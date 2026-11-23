export const normalizeLabel = (label) => label.trim().toUpperCase()

// Next unused reference designator for a toolbox item (R1, R2, …); grounds are always GND.
export function nextReference(item, components) {
  if (item.type === 'ground') return 'GND'
  const used = new Set(components.map((component) => normalizeLabel(component.label)))
  let count = 1
  while (used.has(`${item.prefix}${count}`)) count += 1
  return `${item.prefix}${count}`
}

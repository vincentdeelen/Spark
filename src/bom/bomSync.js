import { findLibraryItem } from '../circuit/library.js'
import { nextReference, normalizeLabel } from '../circuit/references.js'
import { isTriodeSection } from '../tubes/triodes.js'
import { generateBom, matchBom } from './bom.js'

// Keeping the BOM and the circuits in step: references have to be unique within a circuit for a BOM to name its parts.

const isPart = (component) => component.type !== 'ground'

// The references used by more than one component in a circuit: [{ circuitId, circuitName, label, components: [component] }].
export function duplicateReferences(circuits) {
  return circuits.flatMap((circuit) => {
    const byLabel = new Map()
    for (const component of circuit.diagram.components.filter(isPart)) {
      const label = normalizeLabel(component.label)
      byLabel.set(label, [...(byLabel.get(label) ?? []), component])
    }
    return [...byLabel].filter(([, components]) => components.length > 1).map(([label, components]) => ({ circuitId: circuit.id, circuitName: circuit.name, label, components }))
  })
}

// How the duplicates would be renamed: the first component keeps its reference, each other one takes the first free reference
// of its kind (the C5 that was never used). Triode sections (V1A, V1B) are not renamed: their reference carries the section.
// Returns `{ renames: [{ circuitId, circuitName, id, from, to, type }], unresolved: [duplicate] }`.
export function planUniqueReferences(circuits) {
  const renames = []
  const unresolved = []
  for (const duplicate of duplicateReferences(circuits)) {
    const circuit = circuits.find((item) => item.id === duplicate.circuitId)
    const [, ...others] = duplicate.components
    if (others.some((component) => isTriodeSection(component.type) || !findLibraryItem(component.type))) {
      unresolved.push(duplicate)
      continue
    }
    const taken = [...circuit.diagram.components, ...renames.filter((rename) => rename.circuitId === circuit.id).map((rename) => ({ label: rename.to }))]
    for (const component of others) {
      const to = nextReference(findLibraryItem(component.type), taken)
      taken.push({ label: to })
      renames.push({ circuitId: circuit.id, circuitName: circuit.name, id: component.id, from: component.label, to, type: component.type })
    }
  }
  return { renames, unresolved }
}

// The circuits with the planned renames made.
export function withRenames(circuits, renames) {
  return circuits.map((circuit) => {
    const mine = renames.filter((rename) => rename.circuitId === circuit.id)
    if (!mine.length) return circuit
    const labels = new Map(mine.map((rename) => [rename.id, rename.to]))
    return {
      ...circuit,
      diagram: {
        ...circuit.diagram,
        components: circuit.diagram.components.map((component) => (labels.has(component.id) ? { ...component, label: labels.get(component.id) } : component)),
      },
    }
  })
}

// How the BOM and the circuits differ: components the BOM does not list, and BOM rows no component has.
export function bomGaps(circuits, bom) {
  const missing = []
  for (const circuit of circuits) {
    for (const component of circuit.diagram.components.filter(isPart))
      if (!matchBom(bom, circuit.id, component.label)) missing.push({ circuitId: circuit.id, label: normalizeLabel(component.label) })
  }
  const orphans = bom.filter((item) => {
    const circuit = circuits.find((candidate) => candidate.id === item.documentId)
    return !circuit || !circuit.diagram.components.some((component) => matchBom([item], circuit.id, component.label))
  })
  return { missing, orphans }
}

// `change` applied to the BOM row of this circuit and reference.
export const updateBomItem = (bom, documentId, label, change) => bom.map((item) => (item.documentId === documentId && item.label === label ? { ...item, ...change } : item))

// The BOM with a row added for every component it does not list yet; existing rows are left as they are.
export function addMissingToBom(circuits, bom) {
  const known = new Set(bom.map((item) => `${item.documentId}\u0000${item.label}`))
  return [...bom, ...generateBom(circuits, bom).filter((item) => !known.has(`${item.documentId}\u0000${item.label}`))]
}

// The BOM without these rows (matched by circuit and reference).
export function withoutBomItems(bom, items) {
  const removed = new Set(items.map((item) => `${item.documentId}\u0000${item.label}`))
  return bom.filter((item) => !removed.has(`${item.documentId}\u0000${item.label}`))
}

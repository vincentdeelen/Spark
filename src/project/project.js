import { readSparkMetadata } from './circuitFile.js'
import { validateBom } from '../bom/bom.js'
import { validRegion } from '../circuit/sections.js'

export const DEFAULT_PROJECT_NAME = 'Untitled circuit'

const validId = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1000
const validName = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1000

export function readProject(text) {
  let project
  try {
    project = JSON.parse(text)
  } catch {
    throw new Error('The project is not valid JSON.')
  }
  if (
    project?.format !== 'spark-project' ||
    project.version !== 1 ||
    !Array.isArray(project.documents) ||
    !project.documents.length ||
    project.documents.length > 1000 ||
    !Array.isArray(project.views) ||
    !project.views.length ||
    project.views.length > 5000
  ) {
    throw new Error('Unsupported or invalid Live Wire project.')
  }
  const documentIds = new Set()
  const documents = project.documents.map((item) => {
    if (!item || !validId(item.id) || !validName(item.name) || documentIds.has(item.id)) throw new Error('Invalid or duplicate project circuit.')
    documentIds.add(item.id)
    const diagram = readSparkMetadata(JSON.stringify({ format: 'spark-circuit', version: 1, diagram: item.diagram }))
    return { id: item.id, name: item.name, diagram }
  })
  const viewIds = new Set()
  const roots = new Set()
  const views = project.views.map((item) => {
    if (
      !item ||
      !validId(item.id) ||
      !validName(item.name) ||
      viewIds.has(item.id) ||
      !documentIds.has(item.documentId) ||
      (item.region !== null && !validRegion(item.region)) ||
      (item.section !== undefined && typeof item.section !== 'boolean') ||
      (item.section && (!item.region || item.id === item.documentId)) ||
      (!item.section && item.id !== item.documentId)
    ) {
      throw new Error('The project contains an invalid section view.')
    }
    viewIds.add(item.id)
    if (!item.section) roots.add(item.documentId)
    return { id: item.id, documentId: item.documentId, name: item.name, region: item.region ? [...item.region] : null, ...(item.section ? { section: true } : {}) }
  })
  if (roots.size !== documents.length || !viewIds.has(project.activeViewId)) throw new Error('The project has missing circuit views.')
  return { documents, views, activeViewId: project.activeViewId, ...(project.bom !== undefined ? { bom: validateBom(project.bom, documentIds) } : {}) }
}

export function serializeProject({ documents, views, activeViewId, bom }) {
  return JSON.stringify({
    format: 'spark-project',
    version: 1,
    documents: documents.map(({ id, name, diagram }) => ({ id, name, diagram })),
    views,
    activeViewId,
    bom,
  })
}

// Gives an imported project fresh ids so it can sit beside existing circuits without collisions.
export function remapProjectIds(project, makeId) {
  const documentIds = new Map(project.documents.map((item) => [item.id, makeId()]))
  const viewIds = new Map(project.views.map((item) => [item.id, item.section ? makeId() : documentIds.get(item.documentId)]))
  return {
    documents: project.documents.map((item) => ({ ...item, id: documentIds.get(item.id) })),
    views: project.views.map((item) => ({ ...item, id: viewIds.get(item.id), documentId: documentIds.get(item.documentId) })),
    bom: project.bom?.map((item) => ({ ...item, documentId: documentIds.get(item.documentId) })),
    activeViewId: viewIds.get(project.activeViewId),
  }
}

// A Live Wire project file, or a single-circuit .spark file opened as a project of one circuit named `name`.
export function readProjectFile(text, name) {
  let format
  try {
    format = JSON.parse(text)?.format
  } catch {
    throw new Error('The file is not a Live Wire project.')
  }
  if (format !== 'spark-circuit') return readProject(text)
  const diagram = readSparkMetadata(text)
  return { documents: [{ id: 'circuit', name, diagram }], views: [{ id: 'circuit', documentId: 'circuit', name, region: null }], activeViewId: 'circuit' }
}

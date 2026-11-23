import test from 'node:test'
import assert from 'node:assert/strict'
import { readProject, readProjectFile, remapProjectIds, serializeProject } from './project.js'

const project = () => ({
  format: 'spark-project',
  version: 1,
  documents: [{ id: 'doc', name: 'Circuit', diagram: { components: [], wires: [] } }],
  views: [
    { id: 'doc', documentId: 'doc', name: 'Circuit', region: null },
    { id: 'section', documentId: 'doc', name: 'Preamp', region: [0, 0, 100, 100], section: true },
  ],
  activeViewId: 'section',
})

test('restores linked project views pointing to their circuit', () => {
  const input = project()
  assert.deepEqual(readProject(JSON.stringify(input)), { documents: input.documents, views: input.views, activeViewId: 'section' })
})

test('restores resistor ratings in a linked project', () => {
  const input = project()
  input.documents[0].diagram.components.push({ id: 'r', type: 'resistor', x: 20, y: 30, rotation: 0, label: 'R1', value: '10 Ω', wattage: '1/4', tolerance: '1' })
  assert.deepEqual(readProject(JSON.stringify(input)).documents[0].diagram, input.documents[0].diagram)
})

test('rejects project views without their shared circuit or a root view', () => {
  const missingCircuit = project()
  missingCircuit.views[1].documentId = 'missing'
  assert.throws(() => readProject(JSON.stringify(missingCircuit)), /invalid section/)
  const missingRoot = project()
  missingRoot.views.shift()
  assert.throws(() => readProject(JSON.stringify(missingRoot)), /missing circuit views/)
})

test('restores a project BOM and rejects missing circuits or duplicate references', () => {
  const input = project()
  input.bom = [{ documentId: 'doc', label: 'CR5', type: 'diode', value: '1N4007', wattage: '', tolerance: '', description: '', specifications: { Manufacturer: 'Example' } }]
  assert.deepEqual(readProject(JSON.stringify(input)).bom, input.bom)
  input.bom[0].documentId = 'missing'
  assert.throws(() => readProject(JSON.stringify(input)), /Invalid project BOM/)
  input.bom[0].documentId = 'doc'
  input.bom.push({ ...input.bom[0] })
  assert.throws(() => readProject(JSON.stringify(input)), /Duplicate project BOM/)
})

test('serialised projects read back unchanged and drop editor-only fields', () => {
  const input = project()
  input.bom = [{ documentId: 'doc', label: 'R1', type: 'resistor', value: '1k', wattage: '', tolerance: '', description: '', specifications: {} }]
  const documents = input.documents.map((item) => ({ ...item, editorRef: { current: {} } }))
  const text = serializeProject({ documents, views: input.views, activeViewId: input.activeViewId, bom: input.bom })
  assert.equal(JSON.parse(text).documents[0].editorRef, undefined)
  assert.deepEqual(readProject(text), { documents: input.documents, views: input.views, activeViewId: 'section', bom: input.bom })
})

test('imported project ids are remapped consistently across documents, views, and the BOM', () => {
  const input = readProject(
    JSON.stringify({ ...project(), bom: [{ documentId: 'doc', label: 'R1', type: '', value: '', wattage: '', tolerance: '', description: '', specifications: {} }] }),
  )
  let next = 0
  const remapped = remapProjectIds(input, () => `new-${next++}`)
  const [document] = remapped.documents
  const [root, section] = remapped.views
  assert.equal(root.id, document.id)
  assert.equal(root.documentId, document.id)
  assert.notEqual(section.id, document.id)
  assert.equal(section.documentId, document.id)
  assert.equal(remapped.activeViewId, section.id)
  assert.equal(remapped.bom[0].documentId, document.id)
  assert.equal(remapProjectIds(readProject(JSON.stringify(project())), () => 'x').bom, undefined)
})

test('opens a single-circuit file as a project of one circuit, and a project file as itself', () => {
  const circuit = JSON.stringify({ format: 'spark-circuit', version: 1, diagram: { components: [], wires: [] } })
  const single = readProjectFile(circuit, 'Amp')
  assert.deepEqual(
    single.documents.map((item) => item.name),
    ['Amp'],
  )
  assert.deepEqual(single.views, [{ id: 'circuit', documentId: 'circuit', name: 'Amp', region: null }])
  assert.equal(single.activeViewId, 'circuit')
  const whole = JSON.stringify(project())
  assert.deepEqual(readProjectFile(whole, 'ignored'), readProject(whole))
  assert.throws(() => readProjectFile('not json', 'x'), /not a Live Wire project/)
})

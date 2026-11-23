import assert from 'node:assert/strict'
import test from 'node:test'
import { updateRecentList } from './recentProjects.js'
import { duplicateView, insertViewAfter, moveView, removeView, renameView, uniqueName } from './sheetOps.js'

const project = () => ({
  sheets: [
    { id: 'a', name: 'Preamp' },
    { id: 'b', name: 'Power' },
  ],
  views: [
    { id: 'a', documentId: 'a', name: 'Preamp', region: null },
    { id: 's', documentId: 'a', name: 'Tone', region: [0, 0, 100, 100], section: true },
    { id: 'b', documentId: 'b', name: 'Power', region: null },
  ],
  bom: [
    { documentId: 'a', label: 'R1' },
    { documentId: 'b', label: 'R1' },
  ],
})

test('renaming a circuit tab renames the circuit, a section tab only itself', () => {
  const circuit = renameView(project(), 'a', '  Input  ')
  assert.equal(circuit.sheets[0].name, 'Input')
  assert.equal(circuit.views[0].name, 'Input')
  const section = renameView(project(), 's', 'EQ')
  assert.equal(section.views[1].name, 'EQ')
  assert.equal(section.sheets[0].name, 'Preamp')
  assert.equal(renameView(project(), 'a', '   '), null)
})

test('deleting a circuit removes its linked views and BOM rows and selects the next tab', () => {
  const result = removeView(project(), 'a')
  assert.deepEqual(
    result.sheets.map((item) => item.id),
    ['b'],
  )
  assert.deepEqual(
    result.views.map((item) => item.id),
    ['b'],
  )
  assert.deepEqual(result.bom, [{ documentId: 'b', label: 'R1' }])
  assert.equal(result.nextActiveId, 'b')
  assert.equal(result.linkedViews, 1)
  assert.equal(result.bomRows, 1)
})

test('deleting a section view keeps its circuit; the last circuit cannot be deleted', () => {
  const result = removeView(project(), 's')
  assert.deepEqual(
    result.views.map((item) => item.id),
    ['a', 'b'],
  )
  assert.equal(result.sheets.length, 2)
  assert.equal(result.bom.length, 2)
  const single = { sheets: [{ id: 'b', name: 'Power' }], views: [{ id: 'b', documentId: 'b', name: 'Power', region: null }], bom: [] }
  assert.equal(removeView(single, 'b'), null)
})

test('duplicating a circuit copies its drawing and BOM rows into a new tab after it', () => {
  const diagram = { components: [{ id: 'r' }], wires: [] }
  const copy = duplicateView(project(), 'a', diagram, () => 'c')
  assert.deepEqual(
    copy.views.map((item) => item.id),
    ['a', 'c', 's', 'b'],
  )
  assert.equal(copy.views[1].name, 'Preamp copy')
  assert.deepEqual(copy.sheet, { id: 'c', name: 'Preamp copy', diagram })
  assert.notEqual(copy.sheet.diagram, diagram)
  assert.deepEqual(copy.bom.at(-1), { documentId: 'c', label: 'R1' })
  const view = duplicateView(project(), 's', diagram, () => 'd')
  assert.deepEqual(view.views[2], { id: 'd', documentId: 'a', name: 'Tone copy', region: [0, 0, 100, 100], section: true })
  assert.equal(view.sheet, null)
})

test('moves and inserts tabs, and numbers repeated names', () => {
  const { views } = project()
  assert.deepEqual(
    moveView(views, 'b', -1).map((item) => item.id),
    ['a', 'b', 's'],
  )
  assert.equal(moveView(views, 'a', -1), null)
  assert.deepEqual(
    insertViewAfter(views, 'a', { id: 'n' }).map((item) => item.id),
    ['a', 'n', 's', 'b'],
  )
  assert.equal(uniqueName('Tone copy', ['Tone copy', 'Tone copy (2)']), 'Tone copy (3)')
})

test('recent projects keep one entry per name, newest first, up to the limit', () => {
  const list = [
    { key: 'a', savedAt: 3 },
    { key: 'b', savedAt: 2 },
    { key: 'c', savedAt: 1 },
  ]
  const { kept, dropped } = updateRecentList(list, { key: 'b', savedAt: 4 }, 2)
  assert.deepEqual(
    kept.map((item) => item.key),
    ['b', 'a'],
  )
  assert.deepEqual(
    dropped.map((item) => item.key),
    ['c'],
  )
})

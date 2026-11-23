import test from 'node:test'
import assert from 'node:assert/strict'
import { createAssignment, emptyModel, isLearnedMisread, learnReferenceModel, predictOffset, readAssignments, saveAssignment, clearAssignments } from './referenceLearning.js'

function store() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }
}

const labelBox = [100, 100, 130, 112]
const assignment = (reference, type, text, symbolBox) => createAssignment({ reference, type, text, labelBox, symbolBox })

test('an assignment records the symbol position relative to its label in label heights', () => {
  const record = assignment('r17', 'resistor', '(R17)', [100, 130, 160, 150])
  assert.deepEqual(record, { reference: 'R17', prefix: 'R', type: 'resistor', text: 'R17', offset: [1.25, 2.833] })
  assert.equal(createAssignment({ reference: 'C3', type: 'capacitor', text: 'C3' }).offset, null)
  assert.throws(() => createAssignment({ reference: 'not a reference', type: 'resistor' }), /not valid/)
  assert.throws(() => createAssignment({ reference: 'R1', type: 'unknown' }), /not valid/)
})

test('learned references persist, are validated, and keep only the newest records', () => {
  const storage = store()
  assert.deepEqual(readAssignments(storage), [])
  for (let index = 1; index <= 205; index += 1) saveAssignment(createAssignment({ reference: `R${index}`, type: 'resistor' }), storage)
  const records = readAssignments(storage)
  assert.equal(records.length, 200)
  assert.equal(records[0].reference, 'R6')
  storage.setItem('live-wire-reference-learning-v1', '[{"reference":"R1"}]')
  assert.throws(() => readAssignments(storage), /invalid/)
  clearAssignments(storage)
  assert.deepEqual(readAssignments(storage), [])
})

test('the model learns prefix types, OCR misreads and typical symbol offsets', () => {
  const model = learnReferenceModel([
    assignment('VR1', 'potentiometer', 'VR1', [100, 130, 160, 150]),
    assignment('VR2', 'potentiometer', 'VR2', [100, 130, 160, 150]),
    assignment('VR3', 'variable-resistor', 'VR3', null),
    assignment('CR5', 'diode', 'CRS', [90, 125, 150, 145]),
    createAssignment({ reference: 'R7', type: 'resistor', text: 'R7' }),
  ])
  assert.deepEqual(model.prefixTypes, { VR: 'potentiometer', CR: 'diode', R: 'resistor' })
  assert.deepEqual(model.confusions, { 'S>5': 1 })
  assert.deepEqual(predictOffset('potentiometer', model), [1.25, 2.833])
  assert.deepEqual(predictOffset('diode', model), [0.417, 2.417])
  assert.deepEqual(predictOffset('transformer', model), model.offsets.global)
  assert.equal(model.count, 5)
  assert.equal(predictOffset('transformer', emptyModel), null)
})

test('only misreads the user has corrected before are treated as learned', () => {
  const model = learnReferenceModel([assignment('CR5', 'diode', 'CRS', null)])
  assert.equal(isLearnedMisread('CRS', 'CR5', model), true)
  assert.equal(isLearnedMisread('CRS', 'CR8', model), false)
  assert.equal(isLearnedMisread('CR5', 'CR5', model), false)
  assert.equal(isLearnedMisread('CRS', 'CR5', emptyModel), false)
})

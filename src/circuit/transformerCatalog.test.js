import assert from 'node:assert/strict'
import test from 'node:test'
import { generateBom } from '../bom/bom.js'
import { readSparkMetadata } from '../project/circuitFile.js'
import { parseQuantity } from '../shared/siValue.js'
import { buildNetlist } from '../simulation/spiceNetlist.js'
import { createComponent } from './diagramOps.js'
import { findLibraryItem } from './library.js'
import { ratingFields } from './ratings.js'
import { TRANSFORMER_CATALOG, applyCatalogEntry, catalogEntryOfTool, catalogName, catalogTool, findCatalogEntry } from './transformerCatalog.js'
import { transformerWindings } from './transformers.js'

const entry = (id) => TRANSFORMER_CATALOG.find((item) => item.id === id)
const placed = (type, extra = {}) => ({ ...createComponent(findLibraryItem(type), [], { x: 200, y: 100 }), ...extra })

test('the catalog starts with the four requested parts, each of the right kind', () => {
  assert.deepEqual(
    TRANSFORMER_CATALOG.map((item) => [catalogName(item), item.type]),
    [
      ['Peavey 70500211', 'output-transformer'],
      ['Peavey 29231', 'power-transformer'],
      ['Hammond 125ESE', 'single-ended-output-transformer'],
      ['Hammond 291AEX', 'power-transformer'],
    ],
  )
})

test('every entry is valid: a known kind, characteristics that kind carries, readable numbers, notes and a source', () => {
  assert.equal(new Set(TRANSFORMER_CATALOG.map((item) => item.id)).size, TRANSFORMER_CATALOG.length)
  for (const item of TRANSFORMER_CATALOG) {
    assert.ok(findLibraryItem(item.type), item.id)
    for (const field of Object.keys(item.characteristics)) assert.ok(ratingFields(item.type).includes(field), `${item.id}: ${field}`)
    for (const field of ['primaryDcr', 'secondaryDcr']) if (item.characteristics[field]) assert.ok(parseQuantity(item.characteristics[field], 'Ω') > 0, `${item.id}: ${field}`)
    assert.ok(item.notes.length > 0, item.id)
    assert.ok(item.source === '' || /^https:\/\//.test(item.source), item.id)
    // Saved with a circuit, an entry must read back as valid.
    const component = applyCatalogEntry(placed(item.type), item)
    const saved = JSON.stringify({ format: 'spark-circuit', version: 1, diagram: { components: [component], wires: [] } })
    assert.deepEqual(readSparkMetadata(saved).components[0], component)
  }
})

test('only the published figures of a part are filled in', () => {
  const component = applyCatalogEntry(placed('power-transformer'), entry('peavey-29231'))
  assert.equal(component.primaryVoltage, '220 / 230 / 240')
  assert.equal(component.secondaryVoltage, '315 V, 21.5-0-21.5 V, 6.3 V')
  for (const field of ['frequency', 'wattage', 'primaryDcr', 'secondaryDcr']) assert.equal(field in component, false, field)
  assert.equal(component.value, 'Peavey 29231')
  assert.equal(findCatalogEntry('P-CL50-P-240')?.id, 'peavey-29231')
})

test('a part is found by its name, number or alias, whatever the spacing and case', () => {
  for (const text of ['Hammond 291AEX', 'hammond291aex', '291aex', ' 291 AEX ']) assert.equal(findCatalogEntry(text)?.id, 'hammond-291aex', text)
  for (const text of ['Peavey 70500211', '705-00211', 'peavey 705-00211', '30500211']) assert.equal(findCatalogEntry(text)?.id, 'peavey-70500211', text)
  assert.equal(findCatalogEntry('125ese')?.id, 'hammond-125ese')
  assert.equal(findCatalogEntry('4.2 kΩ : 8 Ω'), undefined)
  assert.equal(findCatalogEntry(''), undefined)
})

test('applying a part replaces the kind, value and characteristics and keeps the label, place and size', () => {
  const generic = placed('transformer', { label: 'T7', x: 330, y: 220, scale: 0.8, wattage: '5', primaryDcr: '2' })
  const hammond = applyCatalogEntry(generic, entry('hammond-125ese'))
  assert.deepEqual([hammond.type, hammond.value, hammond.label, hammond.x, hammond.y, hammond.scale], ['single-ended-output-transformer', 'Hammond 125ESE', 'T7', 330, 220, 0.8])
  assert.deepEqual([hammond.primaryImpedance, hammond.secondaryImpedance, hammond.wattage, hammond.primaryDcr], ['2.5 kΩ – 10 kΩ', '4 Ω – 32 Ω', '15', '90.6'])
  // Switching to another part leaves nothing of the first one behind, not even the sample values of the kind.
  const power = applyCatalogEntry(hammond, entry('hammond-291aex'))
  assert.equal(power.type, 'power-transformer')
  for (const field of ['primaryImpedance', 'secondaryImpedance', 'wattage']) assert.equal(field in power, false, field)
  assert.deepEqual([power.primaryVoltage, power.frequency, power.primaryDcr, power.secondaryDcr], ['120 / 220 / 230 / 240', '50/60', '19.6', '334'])
})

test('a catalog part is placed like a tool, and anything else is not a catalog tool', () => {
  assert.equal(catalogEntryOfTool(catalogTool(entry('hammond-291aex'))), entry('hammond-291aex'))
  assert.equal(catalogEntryOfTool('resistor'), undefined)
  assert.equal(catalogEntryOfTool('catalog:nothing'), undefined)
  assert.equal(catalogEntryOfTool(undefined), undefined)
})

test("a catalog part's DC resistance is what the simulation uses, and it lands in the BOM", () => {
  const component = applyCatalogEntry(placed('transformer', { label: 'OT1' }), entry('hammond-125ese'))
  assert.deepEqual(
    transformerWindings(component).map((item) => [item.name, item.ohms, item.assumed]),
    [
      ['Primary', 90.6, false],
      ['Secondary', 0.297, false],
    ],
  )
  const build = buildNetlist({ components: [component], wires: [] })
  assert.ok(!build.issues.some((issue) => /Typical values are assumed/.test(issue.message)))
  const [item] = generateBom([{ id: 'c', name: 'Amp', diagram: { components: [component], wires: [] } }])
  assert.deepEqual([item.type, item.value, item.wattage, item.primaryDcr], ['single-ended-output-transformer', 'Hammond 125ESE', '15', '90.6'])
})

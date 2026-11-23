import assert from 'node:assert/strict'
import test from 'node:test'
import { buildContextMenu } from './menuModels.js'

const resistor = { id: 'r', type: 'resistor', x: 440, y: 180, rotation: 0, label: 'R1', value: '1 kΩ' }
const capacitor = { id: 'c', type: 'capacitor', x: 600, y: 180, rotation: 0, label: 'C1', value: '1 nF' }
const led = { id: 'd', type: 'led', x: 300, y: 300, rotation: 90, label: 'D1', value: 'LED' }
const ribbon = { id: 'w', type: 'ribbon-cable', x: 300, y: 500, rotation: 0, label: 'W1', value: '4-way ribbon', pins: [1, 2, 3, 4] }
const wire = {
  id: 'a',
  points: [
    [480, 180],
    [680, 180],
  ],
}

const calls = []
const actions = new Proxy(
  {},
  {
    get:
      (_, name) =>
      (...args) =>
        calls.push([name, ...args]),
  },
)
const build = ({ target, menu, selected = [target], wires = [], components = [resistor, capacitor, led, ribbon], detachedIds = new Set() }) =>
  buildContextMenu({
    menu: { kind: wires.length || target.points ? 'wire' : 'component', id: target.id, ...menu },
    diagram: { components, wires: [wire] },
    detachedIds,
    selection: { ids: [...selected, ...wires].map((item) => item.id), components: selected.filter((item) => !item.points), wires },
    actions,
  })
const byKey = (menu) => Object.fromEntries(menu.items.map((item) => [item.key, item]))

test('a single resistor can be connected, rotated, detached from its wires and deleted', () => {
  const menu = build({ target: resistor })
  assert.equal(menu.title, 'R1')
  assert.deepEqual(
    menu.items.map((item) => item.key),
    ['series', 'parallel', 'rotate', 'subtype', 'detach', 'delete'],
  )
  const items = byKey(menu)
  assert.equal(items.series.disabled, false)
  assert.equal(items.detach.disabled, false)
  assert.equal(items.detach.label, 'Detach from wires')
  items.series.onSelect()
  items.rotate.onSelect()
  assert.deepEqual(calls.splice(0), [
    ['startConnecting', 'series', 'r'],
    ['rotate', [resistor], 90],
  ])
})

test('a part with no wires on it cannot be detached, and an already detached one can be reattached', () => {
  assert.equal(byKey(build({ target: led })).detach.disabled, true)
  const reattach = byKey(build({ target: resistor, detachedIds: new Set(['r']) })).detach
  assert.equal(reattach.label, 'Keep attached to wires')
  reattach.onSelect()
  assert.deepEqual(calls.splice(0), [['toggleDetach', resistor, true]])
})

test('diodes also rotate by 45° and ribbon cables offer a number of wires', () => {
  assert.ok(byKey(build({ target: led }))['rotate-45'])
  assert.equal(byKey(build({ target: resistor }))['rotate-45'], undefined)
  const wires = byKey(build({ target: ribbon })).wires
  assert.ok(
    wires.children.some((child) => child.label === '✓ 4 wires'),
    'the current size is ticked',
  )
  assert.ok(wires.children.some((child) => child.label === '8 wires'))
  wires.children.find((child) => child.key === '8').onSelect()
  assert.deepEqual(calls.splice(0), [['setRibbonWires', [ribbon], 8]])
})

test('a mixed selection can only be deleted', () => {
  const menu = build({ target: resistor, selected: [resistor, capacitor] })
  const items = byKey(menu)
  assert.equal(menu.title, '2 selected')
  assert.equal(items.delete.label, 'Delete Selection')
  for (const key of ['series', 'parallel', 'rotate', 'subtype', 'detach']) assert.equal(items[key].disabled, true, key)
  // Components of one type can still be connected and rotated together.
  const same = byKey(build({ target: resistor, selected: [resistor, { ...resistor, id: 'r2' }] }))
  assert.equal(same.series.disabled, false)
  assert.equal(same.rotate.disabled, false)
  same.series.onSelect()
  assert.deepEqual(calls.splice(0), [['arrange', 'series']])
})

test('a wire menu offers an arrow and label for the end nearest the click, and delete', () => {
  const menu = build({ target: wire, menu: { point: [670, 180] } })
  assert.equal(menu.title, 'Wire')
  assert.deepEqual(
    menu.items.map((item) => item.key),
    ['arrow', 'end-label', 'delete'],
  )
  menu.items[0].children.find((child) => child.key === 'arrow-out').onSelect()
  assert.deepEqual(calls.splice(0), [['setWireEnd', wire, 'end', { marker: 'arrow-out' }]])
  assert.equal(menu.items[1].label, 'Label this end…')
})

test('a part dropped on another offers series, parallel or leaving them, and a vanished target gives no menu', () => {
  const menu = build({ target: capacitor, menu: { kind: 'drop', targetId: 'r' } })
  assert.equal(menu.title, 'Connect C1?')
  assert.deepEqual(
    menu.items.map((item) => item.label),
    ['Connect in series with R1', 'Connect in parallel with R1', 'Leave it unconnected'],
  )
  menu.items[1].onSelect()
  assert.deepEqual(calls.splice(0), [['arrange', 'parallel', ['r', 'c']]])
  assert.equal(build({ target: capacitor, menu: { kind: 'drop', targetId: 'gone' } }), null)
  assert.equal(build({ target: { id: 'missing' } }), null)
})

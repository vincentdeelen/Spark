import assert from 'node:assert/strict'
import test from 'node:test'
import { testCircuit } from './circuitTest.js'
import { buildNetlist } from './spiceNetlist.js'
import { runSpice } from './spiceRun.js'

// Parts are placed so their terminals are easy to read: a two-terminal part at (x, y) turned 0° has terminals at
// x ± 40 and turned 90° at y ± 40; the + of a source and the anode of a diode are on the left (0°) or top (90°).
let counter = 0
const part = (type, x, y, rotation, label, value, extra = {}) => ({ id: `c${(counter += 1)}`, type, x, y, rotation, label, value, ...extra })
const wire = (...points) => ({ id: `w${(counter += 1)}`, points })
const run = (diagram) => testCircuit(diagram, { title: 'test', simulate: runSpice })
const messagesOf = (report, severity) => report.findings.filter((item) => item.severity === severity).map((item) => item.message)
const partOf = (report, label) => report.parts.find((item) => item.label === label)

// The circuit of spice.spark: a 5 V source feeding an LED through R1, with C1 across R1 and no ground symbol. Turning the
// LED by 180° (rotation 270) swaps its anode and cathode.
const ledCircuit = (ledRotation = 90, extra = []) => ({
  components: [
    part('source', 110, 270, 90, 'V1', '5 V'),
    part('capacitor', 440, 150, 0, 'C1', '47 nF'),
    part('resistor', 440, 210, 0, 'R1', '1 kΩ'),
    part('led', 570, 290, ledRotation, 'D1', 'LED'),
    ...extra,
  ],
  wires: [
    wire([110, 230], [110, 200]),
    wire([110, 200], [400, 200], [400, 150]),
    wire([400, 200], [400, 200], [400, 210]),
    wire([480, 150], [480, 150], [480, 210]),
    wire([480, 210], [570, 210], [570, 250]),
    wire([570, 330], [110, 330], [110, 310]),
  ],
})

test('tests the circuit of spice.spark: the LED lights with about 3 mA', async () => {
  const report = await run(ledCircuit())
  assert.equal(report.verdict, 'pass')
  assert.match(report.netlist, /^v1 n1 0 DC 5/m)
  assert.match(report.netlist, /^r1 n1 n2 1000/m)
  assert.match(report.netlist, /^c1 n1 n2 4\.7e-8/m)
  assert.match(report.netlist, /^d1 n2 0 /m)
  const led = partOf(report, 'D1')
  assert.ok(led.current > 0.003 && led.current < 0.0033, `LED current ${led.current}`)
  assert.ok(led.voltage > 1.7 && led.voltage < 2.0)
  assert.equal(partOf(report, 'C1').current, 0)
  assert.ok(Math.abs(partOf(report, 'R1').voltage - (5 - led.voltage)) < 1e-6)
  assert.deepEqual(
    report.nets.map((net) => [net.node, Math.round(net.voltage * 100) / 100]),
    [
      ['0', 0],
      ['n1', 5],
      ['n2', Math.round(led.voltage * 100) / 100],
    ],
  )
  assert.ok(messagesOf(report, 'info').some((message) => /no ground symbol/.test(message)))
})

test('an LED without a series resistor would burn out', async () => {
  const report = await run({
    components: [part('source', 100, 150, 90, 'V1', '5 V'), part('led', 300, 150, 90, 'D1', 'LED')],
    wires: [wire([100, 110], [300, 110]), wire([300, 190], [100, 190])],
  })
  assert.equal(report.verdict, 'fail')
  assert.match(messagesOf(report, 'error')[0], /D1 carries .* burn out/)
})

test('an LED connected backwards is reported', async () => {
  const report = await run(ledCircuit(270))
  assert.equal(report.verdict, 'fail')
  assert.ok(messagesOf(report, 'error').some((message) => /D1 is connected backwards/.test(message)))
  assert.equal(partOf(report, 'R1').voltage, 0)
})

test('a circuit with no source cannot be tested, and a shorted source is caught before simulating', async () => {
  const noSource = await run({ components: [part('resistor', 200, 110, 0, 'R1', '1 kΩ')], wires: [] })
  assert.equal(noSource.verdict, 'blocked')
  assert.match(messagesOf(noSource, 'error')[0], /no voltage source/)
  const shorted = await run({ components: [part('source', 100, 150, 90, 'V1', '5 V')], wires: [wire([100, 110], [60, 110], [60, 190], [100, 190])] })
  assert.equal(shorted.verdict, 'blocked')
  assert.match(messagesOf(shorted, 'error')[0], /V1 is short-circuited/)
  assert.equal((await run({ components: [], wires: [] })).verdict, 'blocked')
})

test('two voltage sources in parallel are a loop and are not sent to the simulator', async () => {
  const report = await run({
    components: [part('source', 100, 150, 90, 'V1', '5 V'), part('source', 200, 150, 90, 'V2', '3 V')],
    wires: [wire([100, 110], [200, 110]), wire([100, 190], [200, 190])],
  })
  assert.equal(report.verdict, 'blocked')
  assert.match(messagesOf(report, 'error')[0], /loop of voltage sources/)
})

test('a part that cannot be read is named, and the test is blocked', async () => {
  const diagram = ledCircuit()
  diagram.components[2].value = 'lots'
  const report = await run(diagram)
  assert.equal(report.verdict, 'blocked')
  assert.match(messagesOf(report, 'error')[0], /R1 has no usable resistance \("lots"\)/)
})

test('wires that cross are not connected, wires that end on another wire are', () => {
  // V1 → R1 → R2 → back to V1, as one loop; `stray` is an extra wire starting on the wire from V1's + to R1.
  const circuit = (stray) => ({
    components: [part('source', 100, 150, 90, 'V1', '5 V'), part('resistor', 200, 110, 0, 'R1', '1 kΩ'), part('resistor', 200, 250, 0, 'R2', '1 kΩ')],
    wires: [wire([100, 110], [160, 110]), wire([240, 110], [300, 110]), wire([300, 110], [300, 250], [240, 250]), wire([160, 250], [100, 250], [100, 190]), stray],
  })
  const nodesOf = (build, label) => build.parts.find((item) => item.label === label).nodes
  // Down from (130, 110) across the return wire at (130, 250) without touching it: nothing changes.
  const crossing = buildNetlist(circuit(wire([130, 110], [130, 300])))
  assert.equal(crossing.nets.length, 3)
  assert.notEqual(nodesOf(crossing, 'V1').a, nodesOf(crossing, 'V1').b)
  assert.notEqual(nodesOf(crossing, 'R1').a, nodesOf(crossing, 'R2').a)
  // Stopping on the return wire connects the two, which shorts the source.
  const joined = buildNetlist(circuit(wire([130, 110], [130, 250])))
  assert.equal(nodesOf(joined, 'V1').a, nodesOf(joined, 'V1').b)
  assert.equal(joined.canRun, false)
})

test('loose ends are reported, and duplicate labels do not clash', async () => {
  const diagram = ledCircuit(90, [part('resistor', 700, 450, 0, 'R1', '2.2 kΩ')])
  const report = await run(diagram)
  assert.ok(messagesOf(report, 'warning').some((message) => /R1 has a loose end: its terminal 1 and terminal 2 aren't connected/.test(message)))
  assert.match(report.netlist, /^r1 /m)
  assert.match(report.netlist, /^r2 /m)
})

test('a resistor over its power rating overheats', async () => {
  const report = await run({
    components: [part('source', 100, 150, 90, 'V1', '20 V'), part('resistor', 200, 110, 0, 'R1', '100 Ω', { wattage: '1/4' })],
    wires: [wire([100, 110], [160, 110]), wire([240, 110], [260, 110], [260, 190], [100, 190])],
  })
  assert.equal(report.verdict, 'fail')
  assert.match(messagesOf(report, 'error')[0], /R1 dissipates 4 W but is rated 250 mW/)
})

test('a fuse carrying more than its rating blows', async () => {
  const report = await run({
    components: [part('source', 100, 150, 90, 'V1', '12 V'), part('fuse', 160, 110, 0, 'F1', '1 A'), part('resistor', 280, 110, 0, 'R1', '2 Ω')],
    wires: [wire([100, 110], [120, 110]), wire([200, 110], [240, 110]), wire([320, 110], [360, 110], [360, 190], [100, 190])],
  })
  assert.equal(report.verdict, 'fail')
  assert.match(messagesOf(report, 'error')[0], /F1 carries 5\.85 A but is rated 1 A: it would blow/)
})

test('a polarised capacitor connected backwards is an error', async () => {
  const circuit = (rotation) => ({
    components: [part('source', 100, 150, 90, 'V1', '5 V'), part('resistor', 200, 110, 0, 'R1', '1 kΩ'), part('electrolytic-capacitor', 280, 110, rotation, 'C1', '10 µF')],
    wires: [wire([100, 110], [160, 110]), wire([320, 110], [360, 110], [360, 190], [100, 190])],
  })
  // A capacitor in series blocks DC (so no current flows), but it is not reported as backwards the right way round.
  assert.ok(!messagesOf(await run(circuit(0)), 'error').some((message) => /backwards/.test(message)))
  const reversed = await run(circuit(180))
  assert.equal(reversed.verdict, 'fail')
  assert.match(messagesOf(reversed, 'error')[0], /C1 is polarised and is connected backwards/)
})

test('a 12AX7 triode biases to about 1 mA with a 100 k load and a 1.5 k cathode resistor', async () => {
  const report = await run({
    components: [
      part('source', 100, 200, 90, 'V1', '300 V'),
      part('resistor', 300, 110, 90, 'R1', '100 kΩ'),
      part('12ax7-triode', 300, 200, 0, 'V2A', '12AX7', { section: 'A' }),
      part('resistor', 290, 282, 90, 'R2', '1.5 kΩ'),
      part('ground', 290, 360, 0, 'GND', ''),
      part('ground', 254, 260, 0, 'GND', ''),
    ],
    wires: [
      wire([300, 70], [100, 70], [100, 160]),
      wire([300, 150], [300, 158]),
      wire([254, 199], [254, 260]),
      wire([290, 322], [290, 360]),
      wire([100, 240], [100, 360], [290, 360]),
    ],
  })
  assert.equal(report.verdict, 'pass', JSON.stringify(report.findings))
  const tube = partOf(report, 'V2A')
  assert.ok(tube.current > 0.0008 && tube.current < 0.0012, `plate current ${tube.current}`)
  assert.ok(tube.voltage > 190 && tube.voltage < 215, `plate to cathode ${tube.voltage}`)
  assert.ok(Math.abs(partOf(report, 'R2').voltage - 1.5 * 1000 * tube.current) < 0.01)
})

test('parts that are not simulated yet are listed and left out', async () => {
  const diagram = ledCircuit(90, [part('relay', 800, 500, 0, 'K1', 'SPST-NO')])
  const report = await run(diagram)
  assert.ok(messagesOf(report, 'warning').some((message) => /Not simulated yet.*K1 \(Relay\)/.test(message)))
  assert.equal(report.verdict, 'warn')
})

test('a simulator failure is reported instead of thrown', async () => {
  const failing = () => Promise.reject(Object.assign(new Error('ngspice could not solve this circuit.'), { messages: ['singular matrix'] }))
  const report = await testCircuit(ledCircuit(), { title: 'test', simulate: failing })
  assert.equal(report.verdict, 'fail')
  assert.match(messagesOf(report, 'error')[0], /ngspice could not solve this circuit/)
  assert.deepEqual(report.messages, ['singular matrix'])
})

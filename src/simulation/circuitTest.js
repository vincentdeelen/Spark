import { buildNetlist } from './spiceNetlist.js'
import { formatQuantity, parseWattage } from '../shared/siValue.js'
import { TUBE_SPECS } from '../tubes/tubeData.js'

// Tests whether a drawn circuit works: builds its netlist, runs it in ngspice for the DC operating point (the steady state
// once everything has settled), and checks what comes out against what the parts can take.

// Limits for parts with no rating of their own, in amps. Typical 5 mm indicator LEDs.
const LED_WARN_CURRENT = 0.02
const LED_MAX_CURRENT = 0.03
const LED_ON_CURRENT = 0.0002
const FUSE_WARN_RATIO = 0.8
const POWER_WARN_RATIO = 0.8
const UNRATED_POWER_NOTE = 0.25
const OPEN_CIRCUIT_CURRENT = 1e-9
// The simulator leaves picoamp leakage through its stabilising shunt resistors; anything below these is shown as zero.
const NOISE_FLOOR = { voltage: 1e-6, current: 1e-9, power: 1e-12 }
const REVERSED_CAPACITOR_VOLTAGE = -0.5
const POLARISED_CAPACITORS = ['electrolytic-capacitor', 'tantalum-capacitor']
const FUSE_RESISTANCE = 0.05
const SWITCH_RESISTANCE = 0.01

const STATE_RANK = { ok: 0, warn: 1, error: 2 }

// The most plate power a triode of this type can dissipate, from the tube data table (W), or null.
function maxPlateDissipation(type) {
  const row = TUBE_SPECS[type.replace(/-triode$/, '')]?.rows.find(([name]) => /plate dissipation/i.test(name))
  const watts = row && /([\d.]+)\s*W/.exec(row[1])
  return watts ? Number(watts[1]) : null
}

// Reads each part's voltage, current and power from the simulation and judges it. Returns { parts, findings }.
export function judgeParts(build, vectors) {
  const findings = []
  const add = (severity, message, part) => findings.push({ severity, message, ids: [part.id] })
  const voltageOf = (node) => (node === '0' ? 0 : vectors[`v(${node})`])
  const parts = []

  for (const part of build.parts) {
    if (part.skipped || (['resistor', 'pot', 'capacitor', 'inductor', 'source'].includes(part.kind) && part.value === null)) continue
    const { nodes, label, component } = part
    const info = { id: part.id, label, type: component.type, kind: part.kind, value: component.value, voltage: null, current: null, power: null, state: 'ok', note: '' }
    const flag = (state, message) => {
      if (STATE_RANK[state] > STATE_RANK[info.state]) info.state = state
      info.note = message
      add(state === 'warn' ? 'warning' : state, message, part)
    }
    const across = nodes.a !== undefined && nodes.b !== undefined ? voltageOf(nodes.a) - voltageOf(nodes.b) : null
    info.voltage = across

    switch (part.kind) {
      case 'resistor':
      case 'pot': {
        const ohms = part.kind === 'pot' ? part.value / 2 : part.value
        if (part.kind === 'pot') {
          const upper = voltageOf(nodes.a) - voltageOf(nodes.w)
          const lower = voltageOf(nodes.w) - voltageOf(nodes.b)
          info.power = (upper * upper + lower * lower) / ohms
          info.current = upper / ohms
        } else {
          info.current = across / ohms
          info.power = across * info.current
        }
        const rating = parseWattage(component.wattage)
        if (rating) {
          const ratio = info.power / rating
          if (ratio > 1)
            flag('error', `${label} dissipates ${formatQuantity(info.power, 'W')} but is rated ${formatQuantity(rating, 'W')}: it would overheat. Use a higher power rating.`)
          else if (ratio > POWER_WARN_RATIO)
            flag('warn', `${label} runs at ${Math.round(ratio * 100)}% of its ${formatQuantity(rating, 'W')} rating (${formatQuantity(info.power, 'W')}). Leave more margin.`)
        } else if (info.power > UNRATED_POWER_NOTE) {
          info.note = `${formatQuantity(info.power, 'W')}: set a power rating to check it`
          add('info', `${label} dissipates ${formatQuantity(info.power, 'W')}. Set its power rating in Properties so the test can check it.`, part)
        }
        break
      }
      case 'capacitor':
        info.current = 0
        info.power = 0
        if (POLARISED_CAPACITORS.includes(component.type) && across < REVERSED_CAPACITOR_VOLTAGE)
          flag('error', `${label} is polarised and is connected backwards: its + terminal is ${formatQuantity(-across, 'V')} below its − terminal. Rotate it by 180°.`)
        break
      case 'inductor':
        info.current = vectors[`i(${part.spice})`]
        info.power = 0
        break
      case 'source':
        info.current = -vectors[`i(${part.spice})`]
        info.power = across * info.current
        break
      case 'switch':
        info.current = part.closed ? across / SWITCH_RESISTANCE : 0
        info.power = info.current * across
        info.note = part.closed ? 'closed' : 'open'
        break
      case 'fuse': {
        info.current = across / FUSE_RESISTANCE
        info.power = across * info.current
        const amps = Math.abs(info.current)
        if (part.rating && amps > part.rating) flag('error', `${label} carries ${formatQuantity(amps, 'A')} but is rated ${formatQuantity(part.rating, 'A')}: it would blow.`)
        else if (part.rating && amps > FUSE_WARN_RATIO * part.rating)
          flag('warn', `${label} carries ${formatQuantity(amps, 'A')}, close to its ${formatQuantity(part.rating, 'A')} rating.`)
        break
      }
      case 'diode': {
        info.current = vectors[`i(@${part.spice}[id])`]
        info.power = across * info.current
        const amps = info.current
        if (component.type === 'led') {
          if (amps > LED_MAX_CURRENT)
            flag(
              'error',
              `${label} carries ${formatQuantity(amps, 'A')}, more than an LED can take (about ${formatQuantity(LED_MAX_CURRENT, 'A')}): it would burn out. Add or increase a series resistor.`,
            )
          else if (amps > LED_WARN_CURRENT)
            flag(
              'warn',
              `${label} carries ${formatQuantity(amps, 'A')}, more than the usual ${formatQuantity(LED_WARN_CURRENT, 'A')} for an LED. Consider a larger series resistor.`,
            )
          else if (amps >= LED_ON_CURRENT) info.note = `on, ${formatQuantity(amps, 'A')}`
          else if (across < 0) flag('error', `${label} is connected backwards (reverse-biased by ${formatQuantity(-across, 'V')}), so it stays off. Rotate it by 180°.`)
          else flag('warn', `${label} gets only ${formatQuantity(Math.max(amps, 0), 'A')}, so it stays off or barely lights. Check the supply voltage and the series resistor.`)
        } else if (component.type === 'zener-diode' && across < -0.5) info.note = `breakdown at ${formatQuantity(-across, 'V')}`
        else info.note = amps > 1e-6 ? 'conducting' : 'blocking'
        break
      }
      case 'transformer': {
        // The first winding stands for the primary (half of an output transformer's); the power is every winding's I²R.
        const voltages = part.windings.map((winding) => voltageOf(winding.nodeA) - voltageOf(winding.nodeB))
        info.voltage = voltages[0]
        info.current = voltages[0] / part.windings[0].ohms
        info.power = voltages.reduce((total, volts, index) => total + (volts * volts) / part.windings[index].ohms, 0)
        break
      }
      case 'transistor': {
        const collector = vectors[`i(@${part.spice}[ic])`]
        const base = vectors[`i(@${part.spice}[ib])`]
        info.voltage = voltageOf(nodes.c) - voltageOf(nodes.e)
        info.current = collector
        info.power = info.voltage * collector
        info.note = `Ib ${formatQuantity(base, 'A')}`
        break
      }
      case 'triode': {
        const plate = vectors[`i(@${part.spice}[i])`]
        info.voltage = voltageOf(nodes.p) - voltageOf(nodes.k)
        info.current = plate
        info.power = info.voltage * plate
        info.note = `grid ${formatQuantity(voltageOf(nodes.g) - voltageOf(nodes.k), 'V')} to cathode`
        const limit = maxPlateDissipation(component.type)
        if (limit && info.power > limit)
          flag(
            'error',
            `${label} dissipates ${formatQuantity(info.power, 'W')} at the plate, above the ${formatQuantity(limit, 'W')} this tube can take. Raise the cathode resistor to bias it colder.`,
          )
        else if (limit && info.power > POWER_WARN_RATIO * limit)
          flag('warn', `${label} runs hot: ${formatQuantity(info.power, 'W')} at the plate against ${formatQuantity(limit, 'W')} maximum.`)
        if (voltageOf(nodes.g) - voltageOf(nodes.k) > 0.2)
          flag('warn', `${label}'s grid is more than 0.2 V positive of its cathode. A real tube draws grid current there, which this test does not model.`)
        break
      }
      default:
        break
    }
    for (const quantity of ['voltage', 'current', 'power']) if (Math.abs(info[quantity]) < NOISE_FLOOR[quantity]) info[quantity] = 0
    parts.push(info)
  }
  return { parts, findings }
}

// The verdict for a list of findings: 'fail' when anything is wrong, 'warn' when something needs a look, else 'pass'.
export const verdictOf = (findings) => (findings.some((item) => item.severity === 'error') ? 'fail' : findings.some((item) => item.severity === 'warning') ? 'warn' : 'pass')

const HEADLINES = {
  pass: 'This circuit works',
  warn: 'This circuit works, but check the warnings',
  fail: 'This circuit will not work as drawn',
  blocked: "This circuit can't be tested yet",
}

// Builds the netlist and simulates it with `simulate(netlist)` (see spiceRun.js). Never throws: a simulator failure is
// reported as an error in the result. The verdict is 'pass', 'warn' or 'fail', or 'blocked' when the drawing has to be
// fixed before it can be simulated at all (no source, an unreadable value, a short-circuited source).
export async function testCircuit(diagram, { title, simulate }) {
  const build = buildNetlist(diagram, { title })
  const report = { title: build.title, netlist: build.netlist, analysis: 'DC operating point', findings: [...build.issues], parts: [], nets: [], messages: [], ran: false }
  let blocked = !build.canRun
  if (!diagram.components.length) {
    report.findings = [{ severity: 'error', message: 'There is nothing to test: the circuit has no components.', ids: [] }]
    blocked = true
  } else if (!blocked) {
    try {
      const { vectors, messages } = await simulate(build.netlist)
      const { parts, findings } = judgeParts(build, vectors)
      report.ran = true
      report.messages = messages
      report.parts = parts
      report.findings.push(...findings)
      report.nets = build.nets.map((net) => ({ name: net.name, node: net.node, voltage: net.node === '0' ? 0 : vectors[`v(${net.node})`] }))
      const sources = parts.filter((part) => part.kind === 'source')
      if (sources.length && sources.every((part) => Math.abs(part.current) < OPEN_CIRCUIT_CURRENT))
        report.findings.push({
          severity: 'error',
          message:
            'No DC current flows from the supply, so nothing is powered. Either the circuit is open somewhere (check for gaps in the wiring) or a capacitor blocks the current.',
          ids: sources.map((part) => part.id),
        })
    } catch (error) {
      report.messages = error.messages ?? []
      report.findings.push({ severity: 'error', message: `${error.message} This usually means a short circuit, or nothing for the current to flow through.`, ids: [] })
    }
  }
  const order = { error: 0, warning: 1, info: 2 }
  report.findings.sort((a, b) => order[a.severity] - order[b.severity])
  report.verdict = blocked ? 'blocked' : verdictOf(report.findings)
  report.headline = HEADLINES[report.verdict]
  return report
}

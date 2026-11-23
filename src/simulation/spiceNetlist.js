import { distanceToPolyline, distanceToSegment, withoutRepeats } from '../circuit/geometry.js'
import { findLibraryItem } from '../circuit/library.js'
import { boxContains, terminalsOf } from '../circuit/partGeometry.js'
import { TRANSFORMER_PIN_NAMES, transformerWindings } from '../circuit/transformers.js'
import { isTriodeSection } from '../tubes/triodes.js'
import { formatQuantity, parseQuantity } from '../shared/siValue.js'

// Turns a drawn circuit into a SPICE netlist (as ngspice and LTspice read them) and checks that it is wired sensibly.
// Nets come from the geometry: wire pieces that touch are one net, and a component's terminal is on a wire when the wire
// ends at it. Wires that merely cross are not connected, as on the canvas.

// How near, in drawing units, a wire end must come to a terminal. Scaled symbols put terminals off the grid.
export const TOLERANCE = 4
const EPSILON = 0.5

const PIN_NAMES = { a: 'terminal 1', b: 'terminal 2', w: 'wiper', g: 'terminal', c: 'collector', e: 'emitter', p: 'plate', k: 'cathode' }
const pinName = (kind, pin) =>
  kind === 'transformer' ? TRANSFORMER_PIN_NAMES[pin] : kind === 'transistor' && pin === 'b' ? 'base' : kind === 'triode' && pin === 'g' ? 'grid' : PIN_NAMES[pin]

const KIND_BY_TYPE = { inductor: 'inductor', source: 'source', switch: 'switch', ground: 'ground', transistor: 'transistor' }
const KIND_BY_CATEGORY = { CAPACITORS: 'capacitor', DIODES: 'diode', FUSES: 'fuse', TRANSFORMERS: 'transformer' }
const SPICE_LETTER = { resistor: 'r', pot: 'r', capacitor: 'c', inductor: 'l', diode: 'd', source: 'v', switch: 'r', fuse: 'r', transformer: 'r', transistor: 'q', triode: 'b' }

// What a library type simulates as, or null when it cannot be simulated (tubes with more electrodes, relays…).
export function kindOf(type) {
  const item = findLibraryItem(type)
  if (!item) return null
  if (item.category === 'RESISTORS') return type === 'potentiometer' ? 'pot' : 'resistor'
  if (isTriodeSection(type)) return 'triode'
  return KIND_BY_CATEGORY[item.category] ?? KIND_BY_TYPE[type] ?? null
}

// Koren's triode model constants (mu, exponent, kG1, kP, kVB) for the dual triodes the library has.
const TRIODES = {
  '12ax7': [100, 1.4, 1060, 600, 300],
  '12at7': [60, 1.35, 460, 300, 300],
  '12au7': [21.5, 1.3, 1180, 84, 300],
}
const FUSE_RESISTANCE = 0.05
const SWITCH_RESISTANCE = 0.01
const LED_COLOURS = [
  [/red/i, 1.9],
  [/yellow|amber|orange/i, 2.0],
  [/green/i, 2.1],
  [/blue|white|uv/i, 3.0],
]
const LED_DEFAULT_VOLTAGE = 1.95
const LED_SERIES_RESISTANCE = 5
const THERMAL_VOLTAGE = 0.02585
const DEFAULT_ZENER_VOLTAGE = 5.1

// A diode model with the given forward voltage at 10 mA.
function ledModel(forward) {
  const saturation = 0.01 / Math.exp((forward - 0.01 * LED_SERIES_RESISTANCE) / (2 * THERMAL_VOLTAGE))
  return `D(IS=${saturation.toExponential(3)} N=2 RS=${LED_SERIES_RESISTANCE} CJO=10p)`
}

// The SPICE model of a diode part: [model name, model definition].
function diodeModel(component) {
  const text = `${component.value ?? ''}`
  switch (component.type) {
    case 'led': {
      const forward = LED_COLOURS.find(([pattern]) => pattern.test(text))?.[1] ?? LED_DEFAULT_VOLTAGE
      return [`dled_${String(forward).replace('.', 'p')}`, ledModel(forward)]
    }
    case 'rectifier-diode':
      return ['drect', 'D(IS=76.9p RS=42m N=1.45 BV=1000 IBV=5u CJO=26.5p M=0.333 TT=4.32u)']
    case 'schottky-diode':
      return ['dschottky', 'D(IS=1u RS=0.05 N=1.05 BV=40 IBV=100u CJO=50p)']
    case 'zener-diode': {
      const breakdown = parseQuantity(text, 'V') ?? DEFAULT_ZENER_VOLTAGE
      return [`dzener_${String(breakdown).replace('.', 'p')}`, `D(IS=1n RS=2 N=1 BV=${breakdown} IBV=5m)`]
    }
    default:
      return ['d1n4148', 'D(IS=2.52n RS=0.568 N=1.752 CJO=4p M=0.4 TT=20n BV=100 IBV=100u)']
  }
}

// The plate current of a triode as a SPICE expression, from Koren's model.
function triodeCurrent(dual) {
  const [mu, exponent, kg1, kp, kvb] = TRIODES[dual]
  const drive = `${kp}*(1/${mu}+v(g,k)/sqrt(${kvb}+v(p,k)*v(p,k)))`
  return `{(pwr(max(0,(v(p,k)/${kp})*ln(1+exp(min(50,${drive})))),${exponent})/${kg1})*2}`
}

class UnionFind {
  parent = new Map()
  add(key) {
    if (!this.parent.has(key)) this.parent.set(key, key)
  }
  find(key) {
    let root = key
    while (this.parent.get(root) !== root) root = this.parent.get(root)
    for (let node = key; node !== root;) {
      const next = this.parent.get(node)
      this.parent.set(node, root)
      node = next
    }
    return root
  }
  union(a, b) {
    this.parent.set(this.find(a), this.find(b))
  }
}

const ends = (points) => [points[0], points[points.length - 1]]

function describe(component, index) {
  const kind = kindOf(component.type)
  return {
    id: component.id,
    index,
    component,
    label: component.label || findLibraryItem(component.type)?.name || component.type,
    kind,
    terminals: kind ? terminalsOf(component) : [],
  }
}

// Reads the value a part's kind needs. Returns null and reports an issue when it cannot be read.
function readValue(part, addIssue) {
  const { component, kind, label } = part
  const text = (component.value ?? '').trim()
  const need = (unit, what, example) => {
    const value = parseQuantity(text, unit)
    if (value === null || (unit !== 'V' && value <= 0)) {
      addIssue('error', `${label} has no usable ${what}${text ? ` ("${text}")` : ''}. Enter a value such as ${example}.`, [part])
      return null
    }
    return value
  }
  switch (kind) {
    case 'resistor':
    case 'pot':
      return need('Ω', 'resistance', '10 kΩ')
    case 'capacitor':
      return need('F', 'capacitance', '100 nF')
    case 'inductor':
      return need('H', 'inductance', '10 mH')
    case 'source':
      return need('V', 'voltage', '9 V')
    default:
      return null
  }
}

// An unlabelled net is called by the parts on it: "V1 · C1 · R1", or "V1 · C1 · R1 + 2 more".
const memberNames = (labels) => (labels.length > 3 ? `${labels.slice(0, 3).join(' · ')} + ${labels.length - 3} more` : labels.join(' · '))

// Builds the netlist and every check that needs no simulator. `issues` hold errors that stop a simulation (`canRun` false),
// warnings about wiring, and notes about assumptions made.
export function buildNetlist(diagram, { title = 'Live Wire circuit' } = {}) {
  const issues = []
  const addIssue = (severity, message, involved = []) => issues.push({ severity, message, ids: involved.map((part) => part.id) })
  const parts = diagram.components.map(describe)
  const wires = diagram.wires.map((wire) => ({ id: wire.id, label: wire.label?.trim(), points: withoutRepeats(wire.points) })).filter((wire) => wire.points.length > 1)

  const nets = new UnionFind()
  wires.forEach((_, index) => nets.add(`w${index}`))
  parts.forEach((part) =>
    part.terminals.forEach((terminal) => {
      terminal.key = `t${part.index}.${terminal.pin}`
      nets.add(terminal.key)
    }),
  )

  // A wire that ends on another wire (anywhere along it) is joined to it; crossing wires are not.
  wires.forEach((wire, i) =>
    wires.forEach((other, j) => {
      if (i !== j && ends(wire.points).some((end) => distanceToPolyline(end, other.points) < EPSILON)) nets.union(`w${i}`, `w${j}`)
    }),
  )
  // A terminal is on a wire when the wire ends at it, or ends just past it along the wire's last run.
  for (const part of parts) {
    for (const terminal of part.terminals) {
      wires.forEach((wire, index) => {
        const { points } = wire
        const nearEnd = [points.slice(0, 2), points.slice(-2)].some(([from, to]) => distanceToSegment(terminal.point, from, to) <= TOLERANCE)
        if (nearEnd) nets.union(terminal.key, `w${index}`)
      })
    }
  }
  // Terminals that touch each other (a part placed directly against another) are joined.
  const allTerminals = parts.flatMap((part) => part.terminals.map((terminal) => ({ part, terminal })))
  allTerminals.forEach(({ part, terminal }, i) =>
    allTerminals.slice(i + 1).forEach((other) => {
      if (other.part !== part && Math.hypot(terminal.point[0] - other.terminal.point[0], terminal.point[1] - other.terminal.point[1]) < EPSILON)
        nets.union(terminal.key, other.terminal.key)
    }),
  )

  const supported = parts.filter((part) => part.kind)
  const unsupported = parts.filter((part) => !part.kind)
  const sources = supported.filter((part) => part.kind === 'source')
  const grounds = supported.filter((part) => part.kind === 'ground')

  // Every ground symbol is the same node, as on a schematic. Without one, the first source's negative terminal is 0 V.
  grounds.forEach((ground) => nets.union(grounds[0].terminals[0].key, ground.terminals[0].key))
  let groundRoot = null
  if (grounds.length) groundRoot = nets.find(grounds[0].terminals[0].key)
  else if (sources.length) {
    groundRoot = nets.find(sources[0].terminals[1].key)
    addIssue('info', `There is no ground symbol, so ${sources[0].label}'s negative terminal is used as 0 V.`, [sources[0]])
  }

  if (unsupported.length) {
    const names = unsupported.map((part) => `${part.label} (${findLibraryItem(part.component.type)?.name ?? part.component.type})`).join(', ')
    addIssue('warning', `Not simulated yet, so left out of the test: ${names}.`, unsupported)
  }
  if (!sources.length && supported.length) addIssue('error', 'There is no voltage source. Add a voltage source so the circuit has power to test.', [])

  // Names nets in order of first use; the ground net is 0. A net is called by its wires' label if it has one.
  const nodeOf = new Map()
  const netInfo = new Map()
  let counter = 0
  const register = (root, node) => {
    nodeOf.set(root, node)
    netInfo.set(root, { node, labels: [], members: [], terminals: 0, wires: [] })
  }
  const nodeName = (root) => {
    if (!nodeOf.has(root)) {
      counter += 1
      register(root, `n${counter}`)
    }
    return nodeOf.get(root)
  }
  if (groundRoot !== null) register(groundRoot, '0')
  for (const part of supported) {
    for (const terminal of part.terminals) {
      if (terminal.ignored) continue
      const root = nets.find(terminal.key)
      terminal.node = nodeName(root)
      const info = netInfo.get(root)
      info.terminals += 1
      if (part.kind !== 'ground' && !info.members.includes(part.label)) info.members.push(part.label)
    }
  }
  wires.forEach((wire, index) => {
    const info = netInfo.get(nets.find(`w${index}`))
    if (!info) return
    info.wires.push(wire.id)
    if (wire.label) info.labels.push(wire.label)
  })

  // Wires or terminals touching a part that is left out may lead on to it, so they are not reported as loose.
  const touched = new Set()
  for (const part of unsupported) {
    wires.forEach((wire, index) => {
      if (ends(wire.points).some((end) => boxContains(part.component, end))) touched.add(nets.find(`w${index}`))
    })
  }

  const byPin = (part) => Object.fromEntries(part.terminals.map((terminal) => [terminal.pin, terminal.node]))
  const lines = []
  const models = new Map()
  const saves = []
  const counters = {}
  const nameOf = (letter) => {
    counters[letter] = (counters[letter] ?? 0) + 1
    return `${letter}${counters[letter]}`
  }
  const idealEdges = new UnionFind()
  const loops = []
  const emit = (part, text) => lines.push(`${text}   ; ${part.label}`)

  const ordered = [...supported.filter((part) => part.kind === 'source'), ...supported.filter((part) => part.kind !== 'source')]
  for (const part of ordered) {
    if (part.kind === 'ground') continue
    const nodes = byPin(part)
    part.nodes = nodes
    part.spice = nameOf(SPICE_LETTER[part.kind])
    part.value = readValue(part, addIssue)
    const isLoose = (terminal) => !terminal.ignored && netInfo.get(nets.find(terminal.key)).terminals === 1 && !touched.has(nets.find(terminal.key))
    // A transformer winding with neither end wired is just not used; with one end wired it is a loose end.
    const windings = part.kind === 'transformer' ? transformerWindings(part.component) : []
    const unusedWinding = (terminal) =>
      windings.some((winding) => [winding.a, winding.b].includes(terminal.pin) && [winding.a, winding.b].every((pin) => isLoose(part.terminals.find((item) => item.pin === pin))))
    const looseEnds = part.terminals.filter((terminal) => isLoose(terminal) && !(part.kind === 'transformer' && unusedWinding(terminal)))
    if (looseEnds.length) {
      const where = looseEnds.map((terminal) => pinName(part.kind, terminal.pin)).join(' and ')
      addIssue(
        'warning',
        `${part.label} has a loose end: its ${where} ${looseEnds.length > 1 ? "aren't" : "isn't"} connected to anything else, so no current can flow through it.`,
        [part],
      )
    }
    const twoSided = ['resistor', 'capacitor', 'inductor', 'diode', 'source', 'switch', 'fuse'].includes(part.kind)
    if (twoSided && nodes.a === nodes.b) {
      if (part.kind === 'source') addIssue('error', `${part.label} is short-circuited: both its terminals are on the same net.`, [part])
      else addIssue('warning', `${part.label} is shorted out: both its terminals are on the same net, so it has no effect.`, [part])
      part.skipped = true
      continue
    }
    switch (part.kind) {
      case 'resistor':
        if (part.value !== null) emit(part, `${part.spice} ${nodes.a} ${nodes.b} ${part.value}`)
        break
      case 'pot':
        if (part.value !== null) {
          emit(part, `${part.spice}a ${nodes.a} ${nodes.w} ${part.value / 2}`)
          emit(part, `${part.spice}b ${nodes.w} ${nodes.b} ${part.value / 2}`)
          addIssue('info', `${part.label} is simulated with its wiper at the middle.`, [part])
        }
        break
      case 'capacitor':
        if (part.value !== null) emit(part, `${part.spice} ${nodes.a} ${nodes.b} ${part.value}`)
        break
      case 'inductor':
      case 'source':
        if (part.value !== null) {
          emit(part, part.kind === 'source' ? `${part.spice} ${nodes.a} ${nodes.b} DC ${part.value}` : `${part.spice} ${nodes.a} ${nodes.b} ${part.value}`)
          idealEdges.add(nodes.a)
          idealEdges.add(nodes.b)
          if (idealEdges.find(nodes.a) === idealEdges.find(nodes.b)) loops.push(part)
          else idealEdges.union(nodes.a, nodes.b)
        }
        break
      case 'transformer': {
        // At DC a winding is only its resistance, and the windings are not coupled to each other.
        part.windings = transformerWindings(part.component).map((winding) => ({ ...winding, nodeA: nodes[winding.a], nodeB: nodes[winding.b] }))
        part.windings.forEach((winding, index) => emit(part, `${part.spice}${String.fromCharCode(97 + index)} ${winding.nodeA} ${winding.nodeB} ${winding.ohms}`))
        const assumed = part.windings.filter((winding) => winding.assumed)
        const assumption = assumed.length
          ? ` Typical values are assumed for ${assumed.map((winding) => `${winding.name.toLowerCase()} ${formatQuantity(winding.ohms, 'Ω')}`).join(', ')}; enter the DC resistance in Properties to use yours.`
          : ''
        addIssue(
          'info',
          `${part.label} is simulated by the DC resistance of its windings, which are not coupled at DC: signals passing between windings are not modelled.${assumption}`,
          [part],
        )
        break
      }
      case 'diode': {
        const [name, definition] = diodeModel(part.component)
        models.set(name, definition)
        part.model = name
        emit(part, `${part.spice} ${nodes.a} ${nodes.b} ${name}`)
        saves.push(`@${part.spice}[id]`)
        if (part.component.type === 'zener-diode' && parseQuantity(part.component.value, 'V') === null)
          addIssue('info', `${part.label} has no breakdown voltage in its value, so ${DEFAULT_ZENER_VOLTAGE} V is assumed.`, [part])
        break
      }
      case 'fuse':
        emit(part, `${part.spice} ${nodes.a} ${nodes.b} ${FUSE_RESISTANCE}`)
        part.rating = parseQuantity(part.component.value, 'A')
        if (part.rating === null) addIssue('warning', `${part.label}'s current rating can't be read from "${part.component.value}", so it can't be checked.`, [part])
        break
      case 'switch':
        part.closed = !/open|off/i.test(part.component.value ?? '')
        if (part.closed) emit(part, `${part.spice} ${nodes.a} ${nodes.b} ${SWITCH_RESISTANCE}`)
        addIssue('info', `${part.label} is simulated as ${part.closed ? 'closed' : 'open'}.`, [part])
        break
      case 'transistor': {
        const pnp = /pnp/i.test(part.component.value ?? '')
        const name = pnp ? 'qpnp' : 'qnpn'
        models.set(name, `${pnp ? 'PNP' : 'NPN'}(BF=200 IS=1e-14 VAF=100)`)
        emit(part, `${part.spice} ${nodes.c} ${nodes.b} ${nodes.e} ${name}`)
        saves.push(`@${part.spice}[ic]`, `@${part.spice}[ib]`)
        break
      }
      case 'triode': {
        const dual = part.component.type.replace(/-triode$/, '')
        // The model refers to the electrodes by net, so the nodes are substituted into the expression.
        const expression = triodeCurrent(dual)
          .replace(/v\(p,k\)/g, `v(${nodes.p},${nodes.k})`)
          .replace(/v\(g,k\)/g, `v(${nodes.g},${nodes.k})`)
        emit(part, `${part.spice} ${nodes.p} ${nodes.k} I = ${expression}`)
        saves.push(`@${part.spice}[i]`)
        break
      }
      default:
        break
    }
  }
  if (loops.length) {
    addIssue(
      'error',
      `${loops.map((part) => part.label).join(', ')} close${loops.length > 1 ? '' : 's'} a loop of voltage sources and inductors with no resistance in it. That is a short circuit; add a resistor.`,
      loops,
    )
  }
  const triodeNote = supported.filter((part) => part.kind === 'triode')
  if (triodeNote.length) addIssue('info', 'Tube heaters are not simulated. Triodes use a standard model for their tube type.', triodeNote)

  const netlist = [
    `* ${title}`,
    '* Generated by Live Wire. Standard SPICE: it also runs in ngspice and LTspice.',
    '.options rshunt=1e12',
    ...[...models].map(([name, definition]) => `.model ${name} ${definition}`),
    ...lines,
    ...(saves.length ? [`.save all ${saves.join(' ')}`] : []),
    '.op',
    '.end',
  ].join('\n')

  const netList = [...netInfo.values()]
    .filter((info) => info.terminals > 0)
    .map((info) => ({ node: info.node, name: info.node === '0' ? 'Ground (0 V)' : info.labels[0] || memberNames(info.members), wires: info.wires }))

  return { title, canRun: !issues.some((issue) => issue.severity === 'error'), issues, parts: supported.filter((part) => part.kind !== 'ground'), nets: netList, netlist }
}

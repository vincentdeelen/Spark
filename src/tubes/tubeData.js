import { tubeAliases, tubeTypeFromText } from './tubeNames.js'

// Typical characteristics of the tube types in the toolbox, as printed in manufacturer data sheets (GE, Philips/Mullard).
// Values differ between makers and variants, so they describe the type, not a particular tube.
const HEATER_63 = '6.3 V, 0.3 A (pins 4 and 5 joined, to pin 9) or 12.6 V, 0.15 A (pins 4 to 5)'

export const TUBE_SPECS = {
  '12ax7': {
    family: 'Dual high-μ triode',
    perSection: true,
    rows: [
      ['Amplification factor (μ)', '100 (high voltage gain)'],
      ['Plate voltage (Va)', '250 V nominal (300 V to 330 V maximum depending on variant)'],
      ['Plate current (Ia)', '1.2 mA at 250 V (0.5 mA at 100 V)'],
      ['Plate resistance (ra)', '62.5 kΩ at 250 V (80 kΩ at 100 V)'],
      ['Transconductance (gm)', '1,600 μmhos (1.6 mA/V) at 250 V'],
      ['Grid bias voltage (Vg)', '−2.0 V at 250 V plate voltage (−1.0 V at 100 V)'],
      ['Max plate dissipation', '1.0 W to 1.2 W per section'],
      ['Heater', HEATER_63],
    ],
  },
  '12at7': {
    family: 'Dual medium-μ triode',
    perSection: true,
    rows: [
      ['Amplification factor (μ)', '60 (medium gain, good drive capability)'],
      ['Plate voltage (Va)', '250 V nominal (300 V maximum)'],
      ['Plate current (Ia)', '10 mA at 250 V'],
      ['Plate resistance (ra)', '10.9 kΩ at 250 V'],
      ['Transconductance (gm)', '5,500 μmhos (5.5 mA/V) at 250 V'],
      ['Grid bias voltage (Vg)', '−2.0 V at 250 V plate voltage'],
      ['Max plate dissipation', '2.5 W per section'],
      ['Heater', HEATER_63],
    ],
  },
  '12au7': {
    family: 'Dual low-μ triode',
    perSection: true,
    rows: [
      ['Amplification factor (μ)', '17 (low gain, low output impedance)'],
      ['Plate voltage (Va)', '250 V nominal (300 V maximum)'],
      ['Plate current (Ia)', '10.5 mA at 250 V'],
      ['Plate resistance (ra)', '7.7 kΩ at 250 V'],
      ['Transconductance (gm)', '2,200 μmhos (2.2 mA/V) at 250 V'],
      ['Grid bias voltage (Vg)', '−8.5 V at 250 V plate voltage'],
      ['Max plate dissipation', '2.75 W per section (2.5 W for some makers)'],
      ['Heater', HEATER_63],
    ],
  },
  el84: {
    family: 'Power pentode',
    rows: [
      ['Amplification factor (μ)', '19 (screen grid to control grid, μg2-g1)'],
      ['Plate voltage (Va)', '250 V nominal (300 V maximum)'],
      ['Screen grid voltage (Vg2)', '250 V nominal (300 V maximum)'],
      ['Plate current (Ia)', '48 mA at 250 V (screen current 5.5 mA)'],
      ['Plate resistance (ra)', '38 kΩ at 250 V'],
      ['Transconductance (gm)', '11,300 μmhos (11.3 mA/V) at 250 V'],
      ['Grid bias voltage (Vg)', '−7.3 V at 250 V plate and screen voltage'],
      ['Max plate dissipation', '12 W'],
      ['Max screen dissipation', '2 W'],
      ['Heater', '6.3 V, 0.76 A (pins 4 and 5)'],
    ],
  },
  '6l6gc': {
    family: 'Beam power tetrode',
    rows: [
      ['Amplification factor (μ)', '8 (screen grid to control grid, μg2-g1)'],
      ['Plate voltage (Va)', '250 V nominal (500 V maximum)'],
      ['Screen grid voltage (Vg2)', '250 V nominal (450 V maximum)'],
      ['Plate current (Ia)', '72 mA at 250 V (screen current 5 mA)'],
      ['Plate resistance (ra)', '22.5 kΩ at 250 V'],
      ['Transconductance (gm)', '6,000 μmhos (6.0 mA/V) at 250 V'],
      ['Grid bias voltage (Vg)', '−14 V at 250 V plate and screen voltage'],
      ['Max plate dissipation', '30 W'],
      ['Max screen dissipation', '5 W'],
      ['Heater', '6.3 V, 0.9 A (pins 2 and 7)'],
    ],
  },
}

// The characteristics shown for a component: those of its tube type, a triode section's whole tube, or, for the generic
// "Tube", of the type its value names (including equivalent names such as ECC83). Null when the tube type is not known.
export function tubeSpecsFor(component) {
  const type = component.type === 'tube' ? tubeTypeFromText(component.value) : component.type.replace(/-triode$/, '')
  const spec = TUBE_SPECS[type]
  if (!spec) return null
  return { ...spec, type, section: component.type.endsWith('-triode'), equivalents: tubeAliases(type) }
}

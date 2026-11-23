import TubeSymbol from './TubeSymbol.jsx'
import FuseSymbol from './FuseSymbol.jsx'
import RibbonSymbol from './RibbonSymbol.jsx'
import TransformerSymbol from './TransformerSymbol.jsx'
import { isTransformer } from '../../circuit/transformers.js'
import { RIBBON_TYPE, pinsOf } from '../../circuit/ribbon.js'
import { detailedTubeTypes, isTriodeSection } from '../../tubes/triodes.js'
import { fuseTypes } from '../../circuit/library.js'
const diodeTypes = ['diode', 'rectifier-diode', 'zener-diode', 'schottky-diode', 'led', 'photodiode', 'varactor-diode']
const capacitorTypes = ['capacitor', 'ceramic-capacitor', 'film-capacitor', 'electrolytic-capacitor', 'tantalum-capacitor', 'variable-capacitor', 'trimmer-capacitor']
const polarizedCapacitorTypes = ['electrolytic-capacitor', 'tantalum-capacitor']
const resistorTypes = [
  'resistor',
  'carbon-film-resistor',
  'metal-film-resistor',
  'ceramic-resistor',
  'wirewound-resistor',
  'potentiometer',
  'variable-resistor',
  'thermistor',
  'photoresistor',
]

export default function CircuitSymbol({ type, speed, section, pins }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  return (
    <g {...common}>
      {resistorTypes.includes(type) && (
        <>
          <path d="M-40 0h15l5-9 8 18 8-18 8 18 8-18 8 18 5-9h15" />
          {type === 'potentiometer' && <path d="M0 40V1m-5 7 5-7 5 7" />}
          {type === 'variable-resistor' && <path d="M-23 23L23-23M16-23h7v7" />}
          {type === 'thermistor' && <path d="M-20 20L20-20M-20 20h9" />}
          {type === 'photoresistor' && (
            <>
              <circle r="27" />
              <path d="M-27-26l7 7m-5 0h5v-5m1-2l7 7m-5 0h5v-5" />
            </>
          )}
        </>
      )}
      {capacitorTypes.includes(type) && (
        <>
          {polarizedCapacitorTypes.includes(type) ? (
            <>
              <path d="M-40 0h32M-8-15v30M10-15Q2 0 10 15M6 0h34" />
              <path d="M-20-22h8m-4-4v8" />
            </>
          ) : (
            <path d="M-40 0h32M8 0h32M-8-15v30M8-15v30" />
          )}
          {type === 'variable-capacitor' && <path d="M-23 23L23-23M16-23h7v7" />}
          {type === 'trimmer-capacitor' && <path d="M-23 23L23-23M17-29l12 12" />}
        </>
      )}
      {type === 'inductor' && (
        <>
          <path d="M-40 0h12c0-14 14-14 14 0 0-14 14-14 14 0 0-14 14-14 14 0 0-14 14-14 14 0h12" />
        </>
      )}
      {isTransformer(type) && <TransformerSymbol type={type} />}
      {diodeTypes.includes(type) && (
        <>
          <path d="M-40 0h20m0-14v28L8 0z" />
          {type === 'zener-diode' ? <path d="M3-18l5 4v28l5-4" /> : type === 'schottky-diode' ? <path d="M3-18v4h5v28h5v-4" /> : <path d="M8-14v28" />}
          {type === 'varactor-diode' ? <path d="M14-14v28M14 0h26" /> : <path d="M8 0h32" />}
          {type === 'led' && <path d="M-2-19l7-7m-2 0h2v2m2 8l7-7m-2 0h2v2" />}
          {type === 'photodiode' && <path d="M3-27l-7 7m0-4v4h4m10-4l-7 7m0-4v4h4" />}
        </>
      )}
      {type === 'transistor' && (
        <>
          <path d="M-40 0h27M-13-14v28M-13-7L20-20M-13 7l33 13M12 12l8 8-11-1" />
        </>
      )}
      {type === 'tube' && (
        <>
          <circle r="18" />
          <path d="M-40 0h30M-10-9h20M0-9v-11M-10 9h20M0 9v11" />
          <path d="M-10 0h20" strokeDasharray="3 3" />
        </>
      )}
      {(detailedTubeTypes.includes(type) || isTriodeSection(type)) && <TubeSymbol type={type} section={section} />}
      {type === 'ground' && <path d="M0 0v12m-16 0h32m-26 6h20m-14 6h8" />}
      {type === 'source' && (
        <>
          <path d="M-40 0h15m50 0h15" />
          <circle r="25" />
          <path d="M-14 0h8m-4-4v8m17-4h8" />
        </>
      )}
      {type === 'switch' && (
        <>
          <path d="M-40 0h16m48 0h16M-22 0l38-15" />
          <circle cx="-24" r="2" />
          <circle cx="24" r="2" />
        </>
      )}
      {fuseTypes.includes(type) && <FuseSymbol type={type} speed={speed} />}
      {type === RIBBON_TYPE && <RibbonSymbol pins={pinsOf({ pins })} />}
      {type === 'relay' && (
        <>
          <path d="M-20-20v4c-10 0-10 8 0 8-10 0-10 8 0 8-10 0-10 8 0 8-10 0-10 8 0 8v4M20-20v7M20 13v7M20 12L9-9" />
          <path d="M-4 0h8" strokeDasharray="2 3" />
          <circle cx="20" cy="-12" r="1" />
          <circle cx="20" cy="12" r="1" />
        </>
      )}
    </g>
  )
}

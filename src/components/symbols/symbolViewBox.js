import { detailedTubeTypes } from '../../tubes/triodes.js'
import { RIBBON_TYPE, pinsOf, ribbonHalfHeight } from '../../circuit/ribbon.js'

// The part of the drawing area shown when a symbol is previewed (toolbox card, properties panel).
export function symbolViewBox(type, component) {
  if (detailedTubeTypes.includes(type)) return '-130 -110 300 220'
  if (type === RIBBON_TYPE) {
    const half = ribbonHalfHeight(pinsOf(component || {}).length) + 6
    return `${-half - 4} ${-half} ${2 * half + 8} ${2 * half}`
  }
  if (type === 'potentiometer') return '-48 -30 96 76'
  if (type.endsWith('-triode')) return '-52 -48 124 104'
  return '-48 -30 96 60'
}

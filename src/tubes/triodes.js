import { tubeTypeFromText } from './tubeNames.js'

// The tube types the library knows, and the dual triodes that are drawn either whole or one triode (a "section") at a time.

export const dualTriodeTubeTypes = ['12ax7', '12at7', '12au7']
export const detailedTubeTypes = ['el84', ...dualTriodeTubeTypes, '6l6gc']

export const triodeSectionType = (dual) => `${dual}-triode`
export const dualTriodeOfSection = (type) => dualTriodeTubeTypes.find((dual) => triodeSectionType(dual) === type) || ''
export const isTriodeSection = (type) => Boolean(dualTriodeOfSection(type))

// The dual-triode tube a BOM item or component describes: its type, else a tube named in its value or description,
// under any of its names (12AX7 or ECC83).
export function dualTriodeOf(item) {
  if (dualTriodeTubeTypes.includes(item.type)) return item.type
  const named = tubeTypeFromText(`${item.value ?? ''} ${item.description ?? ''}`)
  return dualTriodeTubeTypes.includes(named) ? named : ''
}

// "V2A" → { base: 'V2', section: 'A' }; null when the label has no section letter.
export function splitSectionLabel(label) {
  const match = /^(.*\d)([AB])$/i.exec(label.trim())
  return match ? { base: match[1].toUpperCase(), section: match[2].toUpperCase() } : null
}

// A BOM lists the whole tube (12AX7) while the drawing shows its sections: keep the section type when the BOM type is its tube.
export const typeForBom = (bomType, currentType) => (!bomType || dualTriodeOfSection(currentType) === bomType ? currentType : bomType)

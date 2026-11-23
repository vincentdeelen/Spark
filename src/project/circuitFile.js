import { RATING_FIELDS, RATING_FIELD_NAMES, ratingFields } from '../circuit/ratings.js'
import { isValidRotation, library } from '../circuit/library.js'
import { validLabelPlacement } from '../circuit/labelLayout.js'
import { isRibbon, validPins } from '../circuit/ribbon.js'
import { validRegion } from '../circuit/sections.js'
import { validWireEnds } from '../circuit/wireMarkers.js'
import { MAX_SCALE, MIN_SCALE } from '../shared/zoom.js'

const types = new Set(library.map((item) => item.type))
const isString = (value) => typeof value === 'string' && value.length <= 30000000

// A rating is only valid on component types that carry it, as text, and a blow characteristic must be a known one.
const invalidRatings = (item) =>
  RATING_FIELD_NAMES.some((field) => {
    const value = item[field]
    if (value === undefined) return false
    if (!ratingFields(item.type).includes(field) || !isString(value)) return true
    const options = RATING_FIELDS[field].options
    return Boolean(options) && !options.some((option) => option.value === value) && !(value === '' && !RATING_FIELDS[field].required)
  })
const isCoordinate = (value) => Number.isFinite(value) && Math.abs(value) <= 100000

// Reads the circuit a .spark file or an exported SVG carries as metadata, checking every field. Throws an Error that says
// what is wrong when the text is not a valid, safe circuit.
export function readSparkMetadata(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('The SVG contains invalid circuit metadata.')
  }
  if (
    data?.format !== 'spark-circuit' ||
    data.version !== 1 ||
    !data.diagram ||
    !Array.isArray(data.diagram.components) ||
    !Array.isArray(data.diagram.wires) ||
    data.diagram.components.length > 5000 ||
    data.diagram.wires.length > 10000
  ) {
    throw new Error('Unsupported or invalid circuit metadata.')
  }
  const ids = new Set()
  const checkId = (id) => {
    if (!isString(id) || !id || ids.has(id)) throw new Error('Invalid or duplicate circuit element ID.')
    ids.add(id)
  }
  const components = data.diagram.components.map((item) => {
    if (
      !item ||
      !types.has(item.type) ||
      !isCoordinate(item.x) ||
      !isCoordinate(item.y) ||
      !isValidRotation(item.type, item.rotation) ||
      !isString(item.label) ||
      !isString(item.value) ||
      invalidRatings(item) ||
      (item.pins !== undefined && !(isRibbon(item.type) && validPins(item.pins))) ||
      (item.scale !== undefined && !(Number.isFinite(item.scale) && item.scale >= MIN_SCALE && item.scale <= MAX_SCALE)) ||
      (item.labelPlacement !== undefined && !validLabelPlacement(item.labelPlacement))
    ) {
      throw new Error('The SVG contains an invalid component.')
    }
    checkId(item.id)
    return {
      id: item.id,
      type: item.type,
      x: item.x,
      y: item.y,
      rotation: item.rotation,
      label: item.label,
      value: item.value,
      ...(item.scale !== undefined ? { scale: item.scale } : {}),
      ...(item.labelPlacement !== undefined
        ? { labelPlacement: { x: item.labelPlacement.x, y: item.labelPlacement.y, anchor: item.labelPlacement.anchor, size: item.labelPlacement.size } }
        : {}),
      ...(item.pins !== undefined ? { pins: [...item.pins] } : {}),
      ...Object.fromEntries(RATING_FIELD_NAMES.filter((field) => item[field] !== undefined).map((field) => [field, item[field]])),
    }
  })
  const wires = data.diagram.wires.map((item) => {
    if (
      !item ||
      !Array.isArray(item.points) ||
      item.points.length < 2 ||
      item.points.length > 10000 ||
      item.points.some((point) => !Array.isArray(point) || point.length !== 2 || !point.every(isCoordinate)) ||
      (item.label !== undefined && !isString(item.label)) ||
      (item.ends !== undefined && !validWireEnds(item.ends)) ||
      (item.connectionGroup !== undefined && !isString(item.connectionGroup)) ||
      (item.componentIds !== undefined && (!Array.isArray(item.componentIds) || item.componentIds.length > 5000 || !item.componentIds.every(isString)))
    ) {
      throw new Error('The SVG contains an invalid wire.')
    }
    checkId(item.id)
    return {
      id: item.id,
      points: item.points.map((point) => [...point]),
      ...(item.label !== undefined ? { label: item.label } : {}),
      ...(item.ends !== undefined ? { ends: structuredClone(item.ends) } : {}),
      ...(item.connectionGroup !== undefined ? { connectionGroup: item.connectionGroup } : {}),
      ...(item.componentIds !== undefined ? { componentIds: [...item.componentIds] } : {}),
    }
  })
  const reference = data.diagram.reference
  if (
    reference !== undefined &&
    reference !== null &&
    (typeof reference.dataUrl !== 'string' || reference.dataUrl.length > 40000000 || !/^data:image\/png;base64,[A-Za-z0-9+/]*={0,2}$/.test(reference.dataUrl))
  ) {
    throw new Error('The SVG contains an invalid reference image.')
  }
  const viewRegion = data.diagram.viewRegion
  if (viewRegion !== undefined && !validRegion(viewRegion)) throw new Error('The SVG contains an invalid section view.')
  return { components, wires, ...(reference ? { reference: { dataUrl: reference.dataUrl } } : {}), ...(viewRegion ? { viewRegion: [...viewRegion] } : {}) }
}

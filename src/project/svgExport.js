import { makeId } from '../shared/ids.js'
import { connectionDots, wireHops, wirePath } from '../circuit/junctions.js'
import { exportSection, wireLabelPosition } from '../circuit/sections.js'
import { wireEndMarkers } from '../circuit/wireMarkers.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const EXPORT_STYLE =
  '.wire { fill: none; stroke: #59677c; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; } ' +
  '.wire-hit { display: none; } ' +
  '.junction-dot { fill: #59677c; } ' +
  '.wire-arrow { fill: #59677c; stroke: #59677c; stroke-width: 1; stroke-linejoin: round; } ' +
  '.wire-end-label { fill: #4c5970; font: 700 11px sans-serif; } ' +
  '.component-label { fill: #4c5970; font: 700 11px sans-serif; } ' +
  '.wire-label { fill: #4c5970; font: 700 14px sans-serif; }'

function svgElement(name, attributes = {}, text) {
  const element = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value)
  if (text !== undefined) element.textContent = text
  return element
}

// Redraws a wire (and its label) so a section export contains no clipped geometry from the live canvas.
function wireElement(wire, hops) {
  const group = svgElement('g')
  group.appendChild(svgElement('path', { class: 'wire', d: wirePath(wire.points, hops) }))
  for (const marker of wireEndMarkers(wire)) {
    if (marker.arrow) group.appendChild(svgElement('polygon', { class: 'wire-arrow', points: marker.arrow }))
    if (marker.label) group.appendChild(svgElement('text', { class: 'wire-end-label', x: marker.x, y: marker.y, 'text-anchor': marker.anchor }, marker.label))
  }
  if (wire.label) {
    const [x, y] = wireLabelPosition(wire.points)
    group.appendChild(svgElement('text', { class: 'wire-label', x, y, 'text-anchor': 'middle' }, wire.label))
  }
  return group
}

// Keeps only the part of the reference image inside the section, painted white elsewhere.
async function cropReference(reference, region) {
  const image = new Image()
  image.src = reference.dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create an image canvas for the section.')
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const left = (Math.max(0, region[0]) * canvas.width) / 1000
  const top = (Math.max(0, region[1]) * canvas.height) / 700
  const right = (Math.min(1000, region[2]) * canvas.width) / 1000
  const bottom = (Math.min(700, region[3]) * canvas.height) / 700
  if (right > left && bottom > top) context.drawImage(image, left, top, right - left, bottom - top, left, top, right - left, bottom - top)
  return { dataUrl: canvas.toDataURL('image/png') }
}

// Serialises the live canvas to a standalone SVG that embeds the editable diagram as metadata.
export async function serializeDiagramSvg(svg, diagram, region) {
  let exported = region ? exportSection(diagram, region, makeId) : diagram
  const clone = svg.cloneNode(true)
  if (region && diagram.reference) exported = { ...exported, reference: await cropReference(diagram.reference, region) }
  clone.querySelectorAll('.editor-only').forEach((node) => node.remove())
  if (region) {
    const ids = new Set(exported.components.map((component) => component.id))
    clone.querySelectorAll('.diagram-component').forEach((node) => {
      if (!ids.has(node.getAttribute('data-component-id'))) node.remove()
    })
    const hops = wireHops(exported)
    clone.querySelector('.diagram-wires').replaceChildren(...exported.wires.map((wire) => wireElement(wire, hops[wire.id])))
    clone.querySelector('.junction-dots')?.replaceChildren(...connectionDots(exported).map(([cx, cy]) => svgElement('circle', { class: 'junction-dot', cx, cy, r: 3 })))
    const referenceImage = clone.querySelector('image')
    if (referenceImage && exported.reference) referenceImage.setAttribute('href', exported.reference.dataUrl)
  }
  clone.setAttribute('xmlns', SVG_NS)
  // The canvas grows with the drawing, so the export takes its size from the area shown.
  const [, , viewWidth, viewHeight] = (clone.getAttribute('viewBox') || '0 0 1000 700').split(/\s+/).map(Number)
  clone.setAttribute('width', String(viewWidth))
  clone.setAttribute('height', String(viewHeight))
  clone.setAttribute('style', 'background: white; color: #27334a')
  clone.prepend(svgElement('style', {}, EXPORT_STYLE))
  clone.prepend(svgElement('metadata', { id: 'spark-circuit' }, JSON.stringify({ format: 'spark-circuit', version: 1, diagram: exported })))
  return new XMLSerializer().serializeToString(clone)
}

import { readSparkMetadata } from '../project/circuitFile.js'

const SVG_NS = 'http://www.w3.org/2000/svg'
const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'line',
  'polyline',
  'polygon',
  'rect',
  'circle',
  'ellipse',
  'text',
  'tspan',
  'defs',
  'use',
  'symbol',
  'clipPath',
  'mask',
  'pattern',
  'linearGradient',
  'radialGradient',
  'stop',
  'style',
  'title',
  'desc',
  'metadata',
])

function hasUnsafeCss(value) {
  const withoutLocalUrls = value.replace(/url\(\s*(['"]?)#[\w:.-]+\1\s*\)/gi, '')
  return /\\|\/\*|@|javascript:|data:|url\s*\(/i.test(withoutLocalUrls)
}

function assertSafeElement(element) {
  if (element.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(element.localName)) {
    throw new Error(`SVG element "${element.localName}" is not supported for safe import.`)
  }
  for (const attr of element.attributes) {
    const unsafe = /^on/i.test(attr.localName) || attr.name === 'xml:base' || (attr.localName === 'href' && !/^#[\w:.-]+$/.test(attr.value)) || hasUnsafeCss(attr.value)
    if (unsafe) throw new Error('SVG contains an unsafe or external reference and cannot be imported.')
  }
  if (element.localName === 'style' && hasUnsafeCss(element.textContent)) throw new Error('SVG styles contain an unsafe or external reference.')
}

// Returns { diagram } for SVGs exported by Live Wire (editable), otherwise { blob } holding a sanitised copy to trace.
export function readSvg(text) {
  if (/<!DOCTYPE/i.test(text)) throw new Error('SVG files with a document type declaration are not supported.')
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('This is not a valid SVG file.')
  const metadata = doc.querySelector('metadata#spark-circuit')
  if (metadata) return { diagram: readSparkMetadata(metadata.textContent) }
  doc.querySelectorAll('*').forEach(assertSafeElement)
  return { blob: new Blob([new XMLSerializer().serializeToString(doc.documentElement)], { type: 'image/svg+xml' }) }
}

import { RIBBON_REACH, pinLabel, ribbonHalfHeight, ribbonOffsets } from '../../circuit/ribbon.js'

const HEADER_OUTER = 44
const HEADER_INNER = 36

// A ribbon cable: a connector header on each board, parallel conductors between them, and each conductor's J number.
export default function RibbonSymbol({ pins }) {
  const offsets = ribbonOffsets(pins.length)
  const half = ribbonHalfHeight(pins.length)
  return (
    <>
      <rect x={-HEADER_OUTER} y={-half} width={HEADER_OUTER - HEADER_INNER} height={2 * half} />
      <rect x={HEADER_INNER} y={-half} width={HEADER_OUTER - HEADER_INNER} height={2 * half} />
      <path d={`M${-HEADER_INNER} ${-half}H${HEADER_INNER}M${-HEADER_INNER} ${half}H${HEADER_INNER}`} strokeWidth="1" />
      {offsets.map((y, index) => (
        <g key={index}>
          <path d={`M${-RIBBON_REACH} ${y}H${-HEADER_OUTER}M${-HEADER_INNER} ${y}H${HEADER_INNER}M${HEADER_OUTER} ${y}H${RIBBON_REACH}`} />
          <text x="0" y={y - 3} textAnchor="middle" fill="currentColor" stroke="none" fontFamily="sans-serif" fontSize="8">
            {pinLabel(pins[index])}
          </text>
        </g>
      ))}
    </>
  )
}

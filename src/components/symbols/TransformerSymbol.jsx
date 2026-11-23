// Transformer symbols: a coil per winding either side of the core. The terminals match TRANSFORMER_TERMINALS in
// circuit/transformers.js. Coils bump towards the core; a centre tap is a lead out of the middle of a winding.

const LOOP = 8
const STUB = 4

// A winding on one side: leads out to x = ±40 at its top and bottom, `loops` coils between. `side` is -1 (left) or 1 (right).
function Winding({ side, top, loops, taps = [] }) {
  const bump = -side * 10
  const coils = Array.from({ length: loops }, () => `c${bump} 0 ${bump} ${LOOP} 0 ${LOOP}`).join('')
  return (
    <>
      <path d={`M${side * 40} ${top}h${-side * 10}v${STUB}${coils}v${STUB}h${side * 10}`} />
      {taps.map((y) => (
        <path key={y} d={`M${side * 30} ${y}h${side * 10}`} />
      ))}
    </>
  )
}

export default function TransformerSymbol({ type }) {
  const core = (half) => `M-4-${half}v${2 * half}M4-${half}v${2 * half}`
  if (type === 'power-transformer')
    return (
      <>
        <Winding side={-1} top={-20} loops={4} />
        {/* high-voltage secondary with its centre tap, then the heater winding */}
        <Winding side={1} top={-28} loops={2} taps={[-16]} />
        <Winding side={1} top={8} loops={1} />
        <path d={core(28)} />
      </>
    )
  if (type === 'single-ended-output-transformer')
    return (
      <>
        <Winding side={-1} top={-20} loops={4} />
        <Winding side={1} top={-12} loops={2} />
        <path d={core(20)} />
      </>
    )
  if (type === 'output-transformer')
    return (
      <>
        <Winding side={-1} top={-20} loops={4} taps={[0]} />
        <Winding side={1} top={-12} loops={2} />
        <path d={core(20)} />
      </>
    )
  // The interstage transformer's secondary is centre tapped; the plain transformer has no taps.
  return (
    <>
      <Winding side={-1} top={-20} loops={4} />
      <Winding side={1} top={-20} loops={4} taps={type === 'interstage-transformer' ? [0] : []} />
      <path d={core(18)} />
    </>
  )
}

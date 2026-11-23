import { dualTriodeTubeTypes, isTriodeSection } from '../../tubes/triodes.js'
function Pin({ number, x, y, label, align = 'start' }) {
  return (
    <text x={x} y={y} textAnchor={align} fill="currentColor" stroke="none" fontFamily="sans-serif" fontSize="9">
      {number} {label}
    </text>
  )
}

function PowerTube({ type }) {
  const isEl84 = type === 'el84'
  return (
    <>
      <rect x="-55" y="-70" width="110" height="140" rx="50" />
      <path d="M0-100v50M-24-50h48" />
      <path d="M-120-20h88M-120 0h88" />
      <path d="M-32-20h64M-32 0h64" strokeDasharray="4 4" />
      {isEl84 ? (
        <>
          <path d="M-32 14h64" strokeDasharray="4 4" />
          <path d="M32 14h8v16H0" />
        </>
      ) : (
        <path d="M-30 12h10M20 12h10M-30 12h-10v18H0M30 12h10v18H0" />
      )}
      <path d="M-24 30h48M0 30v70" />
      <path d="M-120 40h20v6l10 4-10 4 10 4-10 4v18h-20" />
      {isEl84 && (
        <>
          <path d="M90-40h30M90 0h30M90 40h30M86-44l8 8m0-8-8 8M86-4l8 8m0-8-8 8M86 36l8 8m0-8-8 8" />
          <Pin number="1" label="NC" x="96" y="-44" />
          <Pin number="6" label="NC" x="96" y="-4" />
          <Pin number="8" label="NC" x="96" y="36" />
        </>
      )}
      <Pin number={isEl84 ? '7' : '3'} label="P" x="5" y="-91" />
      <Pin number={isEl84 ? '9' : '4'} label="G2" x="-115" y="-24" />
      <Pin number={isEl84 ? '2' : '5'} label="G1" x="-115" y="-4" />
      <Pin number={isEl84 ? '3' : '8'} label={isEl84 ? 'K/G3' : 'K/BP'} x="5" y="96" />
      <Pin number={isEl84 ? '4' : '2'} label="H" x="-115" y="36" />
      <Pin number={isEl84 ? '5' : '7'} label="H" x="-115" y="76" />
    </>
  )
}

function DualTriode() {
  return (
    <>
      <rect x="-80" y="-70" width="160" height="140" rx="48" />
      <path d="M-40-100v45M-50-55h20M40-100v45M30-55h20" />
      <path d="M-120-40h40v12h30M120-40H80v12H50" />
      <path d="M-50-28h20M30-28h20" strokeDasharray="4 4" />
      <path d="M-50-5h20M-40-5v85M30-5h20M40-5v85" />
      <path d="M160 0h-40v8l-10 4 10 4-10 4 10 4v16h40M120 40v8l-10 4 10 4-10 4 10 4v16h40" />
      <Pin number="1" label="P" x="-35" y="-91" />
      <Pin number="2" label="G" x="-115" y="-44" />
      <Pin number="3" label="K" x="-58" y="76" align="end" />
      <Pin number="4" label="H" x="127" y="-4" />
      <Pin number="5" label="H" x="127" y="76" />
      <Pin number="6" label="P" x="45" y="-91" />
      <Pin number="7" label="G" x="87" y="-44" />
      <Pin number="8" label="K" x="45" y="76" />
      <Pin number="9" label="H CT" x="122" y="36" />
    </>
  )
}

// One triode of a 9-pin dual triode (a split tube): plate (top), grid (dashed, left) and cathode (bottom) with this half's pin
// numbers, plus this half's heater filament, from its own pin (4 for A, 5 for B) to the centre tap on pin 9 that both halves share.
function TriodeSection({ section }) {
  const pins = section === 'B' ? { p: '6', g: '7', k: '8', h: '5' } : { p: '1', g: '2', k: '3', h: '4' }
  return (
    <>
      <circle r="26" />
      <path d="M-12-10h24M0-10V-42" />
      <path d="M-12-1h24M-46-1h34" strokeDasharray="4 3" />
      <path d="M-16 8h12M-10 8V42" />
      <path d="M2 21l7-8 7 8M2 21V42M16 21V42" />
      <Pin number={pins.p} label="P" x="5" y="-34" />
      <Pin number={pins.g} label="G" x="-44" y="-6" />
      <Pin number={pins.k} label="K" x="-13" y="40" align="end" />
      <Pin number={pins.h} label="H" x="2" y="51" align="end" />
      <Pin number="9" label="H CT" x="16" y="51" />
    </>
  )
}

export default function TubeSymbol({ type, section }) {
  if (isTriodeSection(type)) return <TriodeSection section={section} />
  return dualTriodeTubeTypes.includes(type) ? <DualTriode /> : <PowerTube type={type} />
}

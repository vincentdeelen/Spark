import { FUSE_SPEEDS } from '../../circuit/ratings.js'
// Symbols are drawn inside CircuitSymbol's stroked group, centred on the origin with leads reaching x = ±40.
// Cartridge fuses show their IEC time-current letter (F, T…) above the body when a blow characteristic is set.
export default function FuseSymbol({ type, speed }) {
  const code = FUSE_SPEEDS.find((item) => item.value === speed)?.code
  return (
    <>
      <path d="M-40 0h15M25 0h15" />
      {type === 'blade-fuse' ? (
        <>
          <path d="M-25-9h50v18h-50z" />
          <path d="M-25 0h10l4-6 8 12 4-6h10" />
        </>
      ) : type === 'resettable-fuse' ? (
        <>
          <rect x="-25" y="-8" width="50" height="16" rx="2" />
          <path d="M-18 6L-8 6L10-6" />
          <path d="M10-6H18" />
        </>
      ) : type === 'thermal-fuse' ? (
        <>
          <rect x="-25" y="-8" width="50" height="16" rx="2" />
          <path d="M-25 0h50" />
          <text x="0" y="-13" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10">
            t°
          </text>
        </>
      ) : (
        <>
          <rect x="-25" y="-8" width="50" height="16" rx="2" fill={type === 'ceramic-fuse' ? 'currentColor' : 'none'} fillOpacity={type === 'ceramic-fuse' ? 0.15 : undefined} />
          <path d="M-25 0h50" />
          {type !== 'fuse' && <path d="M-20-8v16M20-8v16" />}
        </>
      )}
      {code && (
        <text x="0" y="-13" textAnchor="middle" fill="currentColor" stroke="none" fontSize="10" fontWeight="700">
          {code}
        </text>
      )}
    </>
  )
}

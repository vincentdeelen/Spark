const icons = {
  pointer: <path d="M5 3l11 8-5 .9-2.2 4.7z" />,
  wire: <path d="M3 15h5V5h8M3 13v4M16 3v4" />,
  undo: (
    <>
      <path d="M7 6L3 10l4 4" />
      <path d="M4 10h8a4 4 0 010 8" />
    </>
  ),
  redo: (
    <>
      <path d="M13 6l4 4-4 4" />
      <path d="M16 10H8a4 4 0 000 8" />
    </>
  ),
  download: (
    <>
      <path d="M10 3v10m-4-4l4 4 4-4" />
      <path d="M4 15v2h12v-2" />
    </>
  ),
  search: (
    <>
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M13 13l4 4" />
    </>
  ),
  rotate: (
    <>
      <path d="M4 9a6 6 0 111 5" />
      <path d="M4 4v5h5" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h12M8 3h4M6 6l1 11h6l1-11M9 9v5m2-5v5" />
    </>
  ),
  plus: <path d="M10 4v12M4 10h12" />,
  minus: <path d="M4 10h12" />,
  fit: <path d="M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4" />,
  chevron: <path d="M6 8l4 4 4-4" />,
  labels: (
    <>
      <path d="M3 5h8l6 5-6 5H3z" />
      <path d="M6.5 8.5h3M6.5 11.5h2" />
    </>
  ),
  arrange: (
    <>
      <rect x="2.5" y="3" width="5" height="5" rx="1" />
      <rect x="12.5" y="12" width="5" height="5" rx="1" />
      <path d="M7.5 5.5H13a2 2 0 012 2V12" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="5" height="5" rx="1" />
      <rect x="12" y="3" width="5" height="5" rx="1" />
      <rect x="3" y="12" width="5" height="5" rx="1" />
      <rect x="12" y="12" width="5" height="5" rx="1" />
    </>
  ),
}

export default function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  )
}

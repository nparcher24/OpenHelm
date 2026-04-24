export function CompassRose({ heading = 0, headingUp = false, size = 72 }) {
  const needleRot = headingUp ? 0 : heading
  const letterRot = headingUp ? -heading : 0
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="54" fill="rgba(10,12,15,0.72)"
              stroke="var(--bg-hairline-strong)" strokeWidth="0.5"/>
      <circle cx="60" cy="60" r="42" fill="none" stroke="var(--bg-hairline)" strokeWidth="0.5"/>
      <g transform={`rotate(${letterRot} 60 60)`}>
        {Array.from({ length: 36 }).map((_, i) => {
          const a = i * 10, major = a % 30 === 0
          return <line key={i} x1="60" y1={major ? 8 : 10} x2="60" y2={major ? 15 : 13}
                       stroke="var(--fg3)" strokeWidth={major ? 1 : 0.5}
                       transform={`rotate(${a} 60 60)`}/>
        })}
        <text x="60" y="24" textAnchor="middle" fontSize="11" fontWeight="700"
              fill="var(--fg1)" fontFamily="Inter" letterSpacing="0.04em">N</text>
        <text x="98" y="64" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--fg2)" fontFamily="Inter">E</text>
        <text x="60" y="104" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--fg2)" fontFamily="Inter">S</text>
        <text x="22" y="64" textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--fg2)" fontFamily="Inter">W</text>
      </g>
      <g transform={`rotate(${needleRot} 60 60)`}>
        <path d="M 60 16 L 64 60 L 60 58 L 56 60 Z" fill="var(--signal)"/>
        <path d="M 60 104 L 56 60 L 60 62 L 64 60 Z" fill="var(--fg3)"/>
      </g>
      <circle cx="60" cy="60" r="3" fill="var(--signal)" stroke="var(--bg)" strokeWidth="1"/>
    </svg>
  )
}

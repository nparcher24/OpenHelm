// Passive compass rose. The whole rose rotates by `-bearing` so N always
// points to true north on the screen. No boat heading, no needle — this is
// a north indicator, nothing else.
//
// Brand alignment (per src/ui/styles/tokens.css):
//   - Glass disc on obsidian, hairline ring
//   - Signal Orange marks the N tip and the "North" eyebrow
//   - Beacon Blue picks out E / S / W intercardinal anchors
//   - Inter, uppercase letterspaced caps for the cardinal letters
export function CompassRose({ bearing = 0, size = 96 }) {
  const rot = -bearing
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: 'block' }}>
      <defs>
        <radialGradient id="oh-rose-disc" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="var(--bg-elev-2)" stopOpacity="0.92"/>
          <stop offset="100%" stopColor="var(--bg)"        stopOpacity="0.92"/>
        </radialGradient>
      </defs>

      {/* Static disc + hairline ring — does not rotate */}
      <circle cx="60" cy="60" r="56" fill="url(#oh-rose-disc)"
              stroke="var(--bg-hairline-strong)" strokeWidth="0.5"/>
      <circle cx="60" cy="60" r="48" fill="none"
              stroke="var(--bg-hairline)" strokeWidth="0.5"/>

      {/* Rotating rose */}
      <g transform={`rotate(${rot} 60 60)`}>
        {/* Tick ring — 36 ticks at 10°, longer at 30°, longest at cardinals */}
        {Array.from({ length: 36 }).map((_, i) => {
          const a = i * 10
          const cardinal = a % 90 === 0
          const major = a % 30 === 0
          const y2 = cardinal ? 16 : major ? 14 : 12
          return (
            <line key={i} x1="60" y1="9" x2="60" y2={y2}
                  stroke={cardinal ? 'var(--fg2)' : 'var(--fg3)'}
                  strokeWidth={cardinal ? 1.25 : major ? 0.8 : 0.5}
                  strokeLinecap="round"
                  transform={`rotate(${a} 60 60)`}/>
          )
        })}

        {/* Cardinal star — four narrow blades, N filled in Signal Orange */}
        {[0, 90, 180, 270].map((a) => {
          const isNorth = a === 0
          const fill = isNorth ? 'var(--signal)' : 'var(--fg3)'
          // Blade: tip at (60, 22), base at center (60, 60), narrow diamond
          return (
            <path key={a}
                  d="M 60 22 L 62.5 60 L 60 60 L 57.5 60 Z"
                  fill={fill}
                  transform={`rotate(${a} 60 60)`}/>
          )
        })}

        {/* Intercardinal hairlines — subtle Beacon Blue */}
        {[45, 135, 225, 315].map((a) => (
          <line key={a} x1="60" y1="20" x2="60" y2="40"
                stroke="var(--beacon)" strokeOpacity="0.55" strokeWidth="0.5"
                transform={`rotate(${a} 60 60)`}/>
        ))}

        {/* Cardinal letters */}
        <text x="60" y="49" textAnchor="middle"
              fontFamily="Inter" fontSize="11" fontWeight="700"
              letterSpacing="0.08em" fill="var(--signal)">N</text>
        <text x="71" y="63.5" textAnchor="middle"
              fontFamily="Inter" fontSize="8" fontWeight="600"
              letterSpacing="0.08em" fill="var(--fg2)">E</text>
        <text x="60" y="77" textAnchor="middle"
              fontFamily="Inter" fontSize="8" fontWeight="600"
              letterSpacing="0.08em" fill="var(--fg2)">S</text>
        <text x="49" y="63.5" textAnchor="middle"
              fontFamily="Inter" fontSize="8" fontWeight="600"
              letterSpacing="0.08em" fill="var(--fg2)">W</text>
      </g>

      {/* Static center pip + tiny upward index mark on the static frame
          to anchor the eye and read "north relative to screen" */}
      <circle cx="60" cy="60" r="1.6" fill="var(--fg2)"/>
    </svg>
  )
}

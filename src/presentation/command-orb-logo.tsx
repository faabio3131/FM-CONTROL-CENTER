export function CommandOrbLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 520 520"
      role="img"
      aria-label="Núcleo de inteligência conectada"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="orb-center" cx="50%" cy="46%" r="58%">
          <stop offset="0%" stopColor="#122c78" />
          <stop offset="55%" stopColor="#071a52" />
          <stop offset="100%" stopColor="#02091f" />
        </radialGradient>
        <linearGradient id="orb-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00e5ff" />
          <stop offset="36%" stopColor="#1689ff" />
          <stop offset="67%" stopColor="#7748ff" />
          <stop offset="100%" stopColor="#00d8ff" />
        </linearGradient>
        <filter id="orb-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="orb-soft" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="28" />
        </filter>
      </defs>

      <circle cx="260" cy="260" r="190" fill="#064dff" opacity=".16" filter="url(#orb-soft)" />
      <circle cx="260" cy="260" r="164" fill="none" stroke="#00ddff" strokeOpacity=".18" strokeWidth="18" />
      <circle cx="260" cy="260" r="153" fill="url(#orb-center)" stroke="url(#orb-ring)" strokeWidth="10" filter="url(#orb-glow)" />
      <circle cx="260" cy="260" r="137" fill="none" stroke="#5b4fff" strokeOpacity=".46" strokeWidth="2" />
      <circle cx="260" cy="260" r="122" fill="none" stroke="#00ddff" strokeOpacity=".18" strokeWidth="1" />

      <path d="M132 245 C198 204 326 204 388 245" fill="none" stroke="#48caff" strokeOpacity=".28" strokeWidth="2" />
      <path d="M138 282 C202 320 320 320 382 282" fill="none" stroke="#7a66ff" strokeOpacity=".25" strokeWidth="2" />
      <path d="M181 142 C232 190 287 334 339 379" fill="none" stroke="#00dfff" strokeOpacity=".18" strokeWidth="2" />
      <path d="M339 142 C286 190 232 334 181 379" fill="none" stroke="#7c57ff" strokeOpacity=".2" strokeWidth="2" />

      <g textAnchor="middle">
        <text x="260" y="252" fill="#e8f7ff" fontSize="24" fontWeight="700" letterSpacing=".2">
          Inteligência
        </text>
        <text x="260" y="282" fill="#aeefff" fontSize="20" fontWeight="600" letterSpacing=".4">
          conectada
        </text>
      </g>
    </svg>
  );
}

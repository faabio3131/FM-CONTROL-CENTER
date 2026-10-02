export function CommandOrbLogo({
  className = "",
}: {
  className?: string;
}) {
  const nodes = [
    [244, 176, 8], [318, 132, 9], [405, 150, 8], [477, 192, 8],
    [204, 239, 7], [285, 228, 8], [360, 211, 7], [447, 235, 8], [516, 258, 7],
    [174, 317, 8], [252, 307, 8], [332, 292, 7], [413, 302, 8], [503, 326, 8],
    [183, 398, 7], [265, 389, 8], [344, 383, 7], [428, 392, 8], [520, 405, 7],
    [221, 470, 8], [306, 464, 8], [392, 471, 7], [478, 476, 8],
    [278, 531, 7], [365, 544, 9], [447, 524, 7],
  ] as const;

  return (
    <svg
      className={className}
      viewBox="0 0 720 820"
      role="img"
      aria-label="Globo luminoso FM Command"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="fm-orb-fill" cx="40%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#123d92" stopOpacity=".72" />
          <stop offset="42%" stopColor="#071f63" stopOpacity=".88" />
          <stop offset="76%" stopColor="#030b2b" stopOpacity=".98" />
          <stop offset="100%" stopColor="#010516" stopOpacity="1" />
        </radialGradient>
        <linearGradient id="fm-orb-stroke" x1="4%" y1="2%" x2="96%" y2="96%">
          <stop offset="0%" stopColor="#00e6ff" />
          <stop offset="50%" stopColor="#327cff" />
          <stop offset="100%" stopColor="#9a5cff" />
        </linearGradient>
        <linearGradient id="fm-command-word" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#58ecff" />
          <stop offset="44%" stopColor="#4c8dff" />
          <stop offset="100%" stopColor="#bd6cff" />
        </linearGradient>
        <filter id="fm-orb-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="fm-node-glow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <clipPath id="fm-orb-clip">
          <circle cx="360" cy="332" r="245" />
        </clipPath>
      </defs>

      <g>
        <circle cx="360" cy="332" r="284" fill="none" stroke="#1468ff" strokeOpacity=".14" strokeWidth="2" />
        <circle cx="360" cy="332" r="268" fill="none" stroke="#9a5cff" strokeOpacity=".15" strokeWidth="2" strokeDasharray="4 13" />
        <circle
          cx="360"
          cy="332"
          r="249"
          fill="url(#fm-orb-fill)"
          stroke="url(#fm-orb-stroke)"
          strokeWidth="3"
          filter="url(#fm-orb-glow)"
        />

        <g clipPath="url(#fm-orb-clip)" fill="none" strokeLinecap="round">
          <g stroke="#00dfff" strokeOpacity=".52" strokeWidth="2.1" filter="url(#fm-node-glow)">
            <ellipse cx="360" cy="332" rx="226" ry="72" />
            <ellipse cx="360" cy="332" rx="226" ry="138" />
            <ellipse cx="360" cy="332" rx="226" ry="205" />
            <ellipse cx="360" cy="332" rx="94" ry="232" />
            <ellipse cx="360" cy="332" rx="170" ry="232" />
            <path d="M116 332h488" />
            <path d="M140 246c112 58 330 58 440 0" />
            <path d="M140 418c112-58 330-58 440 0" />
          </g>
          <g stroke="#8465ff" strokeOpacity=".32" strokeWidth="1.8">
            <ellipse cx="360" cy="332" rx="236" ry="112" transform="rotate(24 360 332)" />
            <ellipse cx="360" cy="332" rx="236" ry="112" transform="rotate(-24 360 332)" />
            <ellipse cx="360" cy="332" rx="206" ry="155" transform="rotate(49 360 332)" />
            <ellipse cx="360" cy="332" rx="206" ry="155" transform="rotate(-49 360 332)" />
          </g>

          <g stroke="url(#fm-orb-stroke)" strokeOpacity=".7" strokeWidth="2.2">
            <path d="M176 221L285 228 360 211 447 235 516 258" />
            <path d="M174 317L252 307 332 292 413 302 503 326" />
            <path d="M183 398L265 389 344 383 428 392 520 405" />
            <path d="M221 470L306 464 392 471 478 476" />
            <path d="M244 176L285 228 252 307 265 389 221 470 278 531" />
            <path d="M318 132L360 211 332 292 344 383 306 464 365 544" />
            <path d="M405 150L447 235 413 302 428 392 392 471 447 524" />
            <path d="M477 192L516 258 503 326 520 405 478 476" />
          </g>
        </g>

        <g fill="#eafcff" stroke="#00dfff" strokeWidth="3" filter="url(#fm-node-glow)">
          {nodes.map(([cx, cy, r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
        </g>

        <g textAnchor="middle" filter="url(#fm-node-glow)">
          <text x="360" y="365" fill="#f8fbff" fontSize="112" fontWeight="900" letterSpacing="-9">
            FM
          </text>
        </g>

        <g transform="translate(130 620)" filter="url(#fm-orb-glow)">
          <rect width="460" height="112" rx="46" fill="#02081d" fillOpacity=".96" stroke="#286fff" strokeWidth="3" />
          <rect x="4" y="4" width="452" height="104" rx="42" fill="none" stroke="#00dfff" strokeOpacity=".28" strokeWidth="2" />
          <rect x="10" y="10" width="440" height="92" rx="37" fill="none" stroke="#8b5cf6" strokeOpacity=".24" />
          <text
            x="230"
            y="72"
            textAnchor="middle"
            fill="url(#fm-command-word)"
            fontSize="49"
            fontWeight="900"
            letterSpacing="12"
          >
            COMMAND
          </text>
        </g>
      </g>
    </svg>
  );
}

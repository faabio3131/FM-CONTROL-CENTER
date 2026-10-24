/**
 * Marca hexagonal oficial do FM Command (a mesma da landing page da FM Tecnologia).
 * Somente apresentação: sem estado, sem dados, sem rede.
 */
export function CommandMark({ className = "", gradientId = "command-mark-gradient" }: { className?: string; gradientId?: string }) {
  return (
    <svg className={className} viewBox="150 82 160 180" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FF9F1C" />
          <stop offset="1" stopColor="#FFC46B" />
        </linearGradient>
      </defs>
      <path d="M230 98 L296 136 L296 212 L230 250 L164 212 L164 136 Z" fill="none" stroke={`url(#${gradientId})`} strokeWidth="22" strokeLinejoin="round" />
      <path d="M205 150 L235 180 L205 210" fill="none" stroke={`url(#${gradientId})`} strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="246" y="200" width="34" height="18" rx="6" fill={`url(#${gradientId})`} />
    </svg>
  );
}

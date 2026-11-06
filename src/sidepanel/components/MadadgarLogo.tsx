import React from 'react';

export interface MadadgarLogoProps {
  className?: string;
  size?: number | string;
}

export const MadadgarLogo: React.FC<MadadgarLogoProps> = ({
  className = 'w-7 h-7',
  size,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-label="Madadgar Logo"
    >
      <defs>
        <linearGradient id="madadgarGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#4338ca" floodOpacity="0.3" />
        </filter>
      </defs>
      <rect x="4" y="4" width="92" height="92" rx="22" fill="url(#madadgarGrad)" filter="url(#glow)" />
      <rect x="4" y="4" width="92" height="92" rx="22" stroke="white" strokeOpacity="0.25" strokeWidth="1.5" />
      {/* M Monogram */}
      <path
        d="M26 74V40L50 60L74 40V74"
        stroke="white"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* AI Sparkle Core */}
      <path
        d="M50 15.5L53 22L59.5 25L53 28L50 34.5L47 28L40.5 25L47 22Z"
        fill="#e0f2fe"
      />
    </svg>
  );
};


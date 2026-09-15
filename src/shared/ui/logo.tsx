// @ts-nocheck
import React from 'react';

export function AlphaShield({ size = 28, mono = false }) {
  const navy = mono ? 'currentColor' : '#101D42';
  const red = mono ? 'currentColor' : '#C8202C';
  const gold = mono ? 'currentColor' : '#F5B921';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M32 4 L58 12 L58 30 C58 46 47 56 32 60 C17 56 6 46 6 30 L6 12 Z"
        fill={red} stroke={mono ? 'none' : '#F5F1E6'} strokeWidth="3" strokeLinejoin="round"/>
      <path d="M10 22 L54 22 L52 30 L12 30 Z" fill={navy}/>
      <text x="32" y="19" textAnchor="middle" fontSize="9" fontWeight="900" fill={gold} fontFamily="system-ui">ALPHA</text>
      <polygon points="20,42 22,48 28,48 23,52 25,58 20,54 15,58 17,52 12,48 18,48"
        fill={gold} transform="scale(0.6) translate(13 12)"/>
      <circle cx="38" cy="44" r="8" fill="#F5F1E6" stroke={navy} strokeWidth="1.5"/>
      <path d="M38 36 L41 39 L40 43 L36 43 L35 39 Z M30 44 L34 42 L38 44 L36 48 L32 48 Z M46 44 L42 42 L38 44 L40 48 L44 48 Z"
        fill={navy}/>
    </svg>
  );
}

/** Crest in a rounded tile — used on the dark frame (sidebar, login, splash). */
export function BrandMark({ size = 38 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}>
      <AlphaShield size={Math.round(size * 0.72)}/>
    </span>
  );
}

export function AlphaWordmark({ height = 38, sub = 'FC · CIMS' }) {
  return (
    <div className="brand">
      <BrandMark size={height}/>
      <div className="brand-text">
        <span className="brand-name">ALPHA<b>.</b></span>
        <span className="brand-sub">{sub}</span>
      </div>
    </div>
  );
}

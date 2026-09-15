// @ts-nocheck
// Site appearance (accent colour), persisted in localStorage.
// Applied by injecting a <style> tag so each value can differ per theme —
// a plain inline root style could not override [data-theme="dark"] tokens.
//
// Injected tokens: --accent (fill), --accent-contrast (text on the fill) and
// --accent-ink (the accent made readable as text on light surfaces). Every
// other accent-ish token derives from them in index.css via color-mix.

const KEY = 'alpha_appearance_v3';

const INK = '#0E1311';

export const DEFAULT_APPEARANCE = { accent: '#C8F03C' };

export const ACCENTS = [
  '#C8F03C', // volt
  '#3DDC97', // mint
  '#34C6F4', // sky
  '#3D6BFF', // electric blue
  '#9B7BFF', // violet
  '#FF5DA2', // pink
  '#FF6B4A', // coral
  '#FFB020', // amber
];

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

export function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
}

// WCAG relative luminance, 0 (black) → 1 (white)
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Ink or white text on top of the accent — whichever reads better
function contrastOn(hex) {
  return contrast(hex, INK) >= contrast(hex, '#FFFFFF') ? INK : '#FFFFFF';
}

// Darken toward ink until the colour passes AA as text on white
function inkFor(hex) {
  let out = hex;
  for (let t = 0; t <= 0.9 && contrast(out, '#FFFFFF') < 5.2; t += 0.04) {
    out = mix(hex, INK, t);
  }
  return out;
}

// Dark surfaces swallow very dark accents — lift them until they read clearly
function accentForDark(hex) {
  let out = hex;
  for (let t = 0; t <= 0.8 && contrast(out, '#151B18') < 5; t += 0.05) {
    out = mix(hex, '#FFFFFF', t);
  }
  return out;
}

export function loadAppearance() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APPEARANCE };
    return { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode */ }
}

export function isDefaultAppearance(a) {
  return String(a.accent).toLowerCase() === DEFAULT_APPEARANCE.accent.toLowerCase();
}

export function applyAppearance(a = loadAppearance()) {
  let el = document.getElementById('alpha-appearance');
  if (isDefaultAppearance(a)) {
    if (el) el.remove(); // CSS defaults already match
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = 'alpha-appearance';
    document.head.appendChild(el);
  }
  const acc = a.accent || DEFAULT_APPEARANCE.accent;
  const accDark = accentForDark(acc);
  // html-qualified selectors outrank the stylesheet's :root / [data-theme]
  // tokens no matter which <style> ends up later in <head>.
  el.textContent = `
html:root {
  --accent: ${acc};
  --accent-contrast: ${contrastOn(acc)};
  --accent-ink: ${inkFor(acc)};
}
html[data-theme="dark"] {
  --accent: ${accDark};
  --accent-contrast: ${contrastOn(accDark)};
  --accent-ink: ${accDark};
}
`;
}

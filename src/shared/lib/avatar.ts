// @ts-nocheck
export const AVATAR_COLORS = ['#2F6B4F', '#3D5AFE', '#B5462B', '#7253D6', '#0F7C86', '#A3326A', '#8A6A12', '#35516B'];
export function avatarColor(id) { return AVATAR_COLORS[(id || 0) % AVATAR_COLORS.length]; }
export function getInitials(name) {
  return String(name || 'AY')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('') || 'AY';
}

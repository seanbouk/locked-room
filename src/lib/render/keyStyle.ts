// Per-skeleton-key identity colour. One source of truth for the tray icon, the
// drag ghost, the reward screen, and the colour of the light a key reveals.
// Approved palette (SchemeColor "Plenty of Scope").
export const KEY_COLORS: Record<string, string> = {
  semicircle: '#3554dc', // Right-Angle — blue
  'triangle-sum': '#f0d118', // Triangle — yellow
  'same-segment': '#00ad8e', // Same-Segment — teal
  'angle-at-centre': '#f12549', // Double-Angle — red
  'isosceles-radii': '#832db4', // Balance — purple
};

/** RGB 0..1 triple for a key colour (for the WebGL god-light tint). */
export function keyTintRGB(id: string): [number, number, number] {
  const hex = KEY_COLORS[id] ?? '#ffffff';
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

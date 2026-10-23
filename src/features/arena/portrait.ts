// Presentation only. A deterministic local "taste portrait" so every candidate
// has a meaningful visual. It carries no property identity and is never an
// input to authorization.
export const PORTRAIT_LABEL = "Taste portrait · presentation only";

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function portraitSeed(id: string) {
  const value = hash(id);
  return {
    palette: value % 6,
    glowX: 54 + ((value >>> 3) % 34),
    glowY: 12 + ((value >>> 7) % 22),
    tilt: -6 + ((value >>> 11) % 11),
    arcs: 2 + ((value >>> 15) % 3),
  };
}

export function monogram(name: string) {
  const letter = name.trim()[0];
  return letter ? letter.toLocaleUpperCase() : "·";
}

// Presentation only. A deterministic, authored "taste image" so every
// candidate card shows a real image asset. It is illustrative, never property
// photography, carries no property identity and is never an input to
// authorization.
export const TASTE_IMAGE_LABEL =
  "Illustrative taste image · not property photography";

export const TASTE_IMAGE_COUNT = 8;

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

// The Taste Spectrum pairing (0-7) is shared by the image and the card accent.
export function portraitSeed(id: string) {
  return { palette: hash(id) % TASTE_IMAGE_COUNT };
}

export function tasteImageSrc(id: string) {
  return `/taste/taste-${portraitSeed(id).palette}.svg`;
}

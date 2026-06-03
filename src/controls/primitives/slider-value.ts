// The web slider wrapper maps an exact 0 (and NaN/undefined) to `undefined`,
// then crashes calling `.toFixed()` on it. A hair above zero is visually
// identical and keeps the control alive; the real (possibly 0) value still
// flows through onChange and the readout, so this is presentation-only.
const SLIDER_EPSILON = 1e-4;

export const safeSliderValue = (v: number): number =>
  Number.isFinite(v) && v !== 0 ? v : SLIDER_EPSILON;

/** Shared track/thumb tints so every slider in the kit reads the same. */
export const SLIDER_TINTS = {
  minimumTrackTintColor: '#8888ff',
  maximumTrackTintColor: '#444',
  thumbTintColor: '#eeeeff',
} as const;

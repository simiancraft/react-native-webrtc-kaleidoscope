// Generic, cross-everything primitives. No domain or platform coupling, so they
// are safe in any flow (runtime, prebuild, components).

/** RGB color, each channel in [0, 1]. */
export type RGB = readonly [number, number, number];

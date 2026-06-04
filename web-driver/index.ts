// The web driver's public surface: the JS/WebGL rendering engine, a root-level
// peer of android/ and ios/ (the three effect drivers; see PATTERNS.md). This
// barrel is the contract the runtime web entry (src/index.web.ts) consumes; the
// driver's internals (the segmenter, the generated shader sources, the per-layer
// shader map) stay private to this folder. Only the composite/transform builders,
// the Insertable-Streams stage applier, and the mutable tuning state cross the
// boundary.

export { makeComposite, resetLayerUniforms, setLayerUniforms } from './effects/composite';
export { makeTransform } from './effects/transform';
export type { DisposablePipeline, FrameTransform } from './insertable-streams';
export { applyEffectToTrack } from './insertable-streams';
export { tuning } from './tuning';

// Shared contract for the platform-split image loaders (<name>.ts / <name>.web.ts).
// The value a consumer passes as an `image` layer's `source`: a fetchable URL on
// web, the plate id (preset name) on native. Both variants annotate their export
// against this so the pair cannot drift.
export type PresetSource = string;

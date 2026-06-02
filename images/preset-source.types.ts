// Shared contract for the platform-split preset loaders (office-N.ts / .web.ts).
// The value a consumer passes as the `background-image` effect's `source`:
// a fetchable URL on web, the preset name on native. Both variants annotate
// their export against this so the pair cannot drift.
export type PresetSource = string;

// Catalog of the standalone images the library ships. Images live under
// catalog/images/<category>/, filed by their taxonomy category, several leaves
// per folder; each name here is a leaf, which is the image id an `image` layer
// uses as its `source` on native (the bundled WebP basename, globally unique) and
// the key the WebP URL resolves to on web. The cutout images that only feed
// packaged composites (fairy-caves, spaceship, wizard-tower) are not listed here.
// Consumed by:
//   - src/index.ts and src/index.web.ts, which re-export the CatalogImageId type
//     so a consumer's image-layer `source` autocompletes to a bundled image (a
//     free-form string is also accepted on web for consumer-provided URLs),
//   - the per-image loader pairs (catalog/images/<category>/<leaf>.ts and .web.ts),
//     which annotate their export against PresetSource.
//
// The native side does NOT mirror this list at registration time: there is one
// registered effect, `composite`, and images are data. At `expo prebuild` the
// config plugin reads the consumer's preset book, finds the image layers it
// references, and copies just those WebPs into the native bundle under
// assets/images/<leaf>.webp.
//
// To add an image: append the leaf here, create catalog/images/<category>/ with
// the optimized <leaf>.webp plus the <leaf>.ts / <leaf>.web.ts loader pair, and
// add the ./images/<category>/<leaf> and .webp package exports. No native change
// is needed; see catalog/images/README.md.

export const CATALOG_IMAGE_IDS = [
  'debug-resolutions',
  'office-dark',
  'office-light',
  'home-light',
  'home-dark',
  'landscape-light',
  'landscape-dark',
  'sci-fi-light',
  'oceanscape-dark',
  'simiancraft-light',
  'simiancraft-dark',
  'simiancraft-light-transparency',
  'simiancraft-dark-transparency',
  'corporate-logo',
] as const;

export type CatalogImageId = (typeof CATALOG_IMAGE_IDS)[number];

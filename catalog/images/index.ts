// Barrel for the catalog's images: the platform-agnostic image-id list. The
// per-image WebP sources are not re-exported here; import them per image so each
// pulls only its own WebP, e.g.
// `import { officeDark } from 'react-native-webrtc-kaleidoscope/images/office/office-dark'`.

export type { CatalogImageId } from './image-ids';
export { CATALOG_IMAGE_IDS } from './image-ids';

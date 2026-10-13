// Normalize a preset's `thumbnail` into the source the picker renders: a string
// (web URL or native preset name) or a number (a Metro asset module id). From
// Expo SDK 57, a web `require('./x.webp')` yields an asset object
// `{ uri, width, height }` rather than a URL string; its `uri` is the URL.
export function thumbnailSource(thumbnail: unknown): string | number | undefined {
  if (typeof thumbnail === 'string' || typeof thumbnail === 'number') return thumbnail;
  if (
    thumbnail !== null &&
    typeof thumbnail === 'object' &&
    'uri' in thumbnail &&
    typeof thumbnail.uri === 'string'
  ) {
    return thumbnail.uri;
  }
  return undefined;
}

// Bundler-resolved static assets. Metro and web bundlers turn a WebP import
// into an asset reference (a numeric module id); Image.resolveAssetSource
// converts that reference to a URL at runtime.
declare module '*.webp' {
  const uri: number;
  export default uri;
}

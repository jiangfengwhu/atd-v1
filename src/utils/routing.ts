/**
 * Determine whether a request pathname points to a non-HTML static asset file
 * (e.g., .js, .css, .png, .map) that should return 404 rather than SPA fallback HTML.
 */
export function isStaticAssetFilePath(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname) && !/\.html?$/i.test(pathname);
}

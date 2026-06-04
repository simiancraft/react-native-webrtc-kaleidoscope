import path from 'node:path';
import { LOG_TAG } from '../lib/constants';
import { copyRefs } from '../lib/file-manipulation';
import { collectReferencedAssets, PRESET_BOOK_FILENAME } from '../lib/preset-book';

/**
 * Merge every referenced image AND composite thumbnail into the Android
 * app's assets/images, so CompositeFactory and the picker resolve each by the
 * same basename id JS sends. One flat dir; the `-thumb` suffix on thumbnails
 * keeps the two families disjoint. Idempotent; non-fatal (returns quietly when
 * the consumer declares no preset book).
 */
export function copyAndroidAssets(projectRoot: string, platformProjectRoot: string): void {
  const assets = collectReferencedAssets(projectRoot);
  if (!assets) return;
  const destDir = path.join(platformProjectRoot, 'app', 'src', 'main', 'assets', 'images');
  const images = copyRefs(assets.images, destDir);
  const thumbs = copyRefs(assets.thumbs, destDir);
  if (images.length + thumbs.length > 0) {
    console.log(
      `${LOG_TAG} Copied ${images.length} image(s) and ${thumbs.length} thumbnail(s) into the Android bundle from ${PRESET_BOOK_FILENAME}.`,
    );
  }
}

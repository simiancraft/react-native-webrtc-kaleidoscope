/// <reference path="./assets.d.ts" />
import { Asset } from 'expo-asset';
import debugResolutionsAsset from './debug-resolutions.webp';
import type { PresetSource } from './preset-source.types';

// Web variant. A viewport/resolution calibration grid (concentric labeled
// rectangles for common capture resolutions) for verifying background
// cover-fit clipping, crop, and scale on device.
export const debugResolutions: PresetSource = Asset.fromModule(debugResolutionsAsset).uri;

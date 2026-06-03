/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import debugResolutionsAsset from './debug-resolutions.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const debugResolutions: PresetSource = Asset.fromModule(debugResolutionsAsset).uri;

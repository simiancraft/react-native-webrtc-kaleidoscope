/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import corporateLogoAsset from './corporate-logo.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const corporateLogo: PresetSource = Asset.fromModule(corporateLogoAsset).uri;

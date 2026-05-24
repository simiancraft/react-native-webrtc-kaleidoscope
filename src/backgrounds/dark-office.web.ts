/// <reference path="./assets.d.ts" />
import { Asset } from 'expo-asset';
import darkOfficeAsset from './dark-office.webp';
import type { PresetSource } from './preset-source.types';

// Web variant. The bundled WebP's URL, which the background-image effect
// fetches. Resolved with expo-asset because react-native-web has no
// Image.resolveAssetSource; `.uri` is set synchronously by fromModule.
export const darkOffice: PresetSource = Asset.fromModule(darkOfficeAsset).uri;

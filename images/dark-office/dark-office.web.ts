/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import darkOfficeAsset from './dark-office.webp';

// Web variant. The bundled WebP's URL, which the image layer
// fetches. Resolved with expo-asset because react-native-web has no
// Image.resolveAssetSource; `.uri` is set synchronously by fromModule.
export const darkOffice: PresetSource = Asset.fromModule(darkOfficeAsset).uri;

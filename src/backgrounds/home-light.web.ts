/// <reference path="./assets.d.ts" />
import { Asset } from 'expo-asset';
import homeLightAsset from './home-light.webp';
import type { PresetSource } from './preset-source.types';

// Web variant. The bundled WebP's URL, which the background-image effect fetches.
export const homeLight: PresetSource = Asset.fromModule(homeLightAsset).uri;

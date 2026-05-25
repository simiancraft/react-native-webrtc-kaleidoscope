/// <reference path="./assets.d.ts" />
import { Asset } from 'expo-asset';
import natureLightAsset from './nature-light.webp';
import type { PresetSource } from './preset-source.types';

// Web variant. The bundled WebP's URL, which the background-image effect fetches.
export const natureLight: PresetSource = Asset.fromModule(natureLightAsset).uri;

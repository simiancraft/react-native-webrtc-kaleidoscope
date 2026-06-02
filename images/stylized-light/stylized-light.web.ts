/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import stylizedLightAsset from './stylized-light.webp';

// Web variant. The bundled WebP's URL, which the background-image effect fetches.
export const stylizedLight: PresetSource = Asset.fromModule(stylizedLightAsset).uri;

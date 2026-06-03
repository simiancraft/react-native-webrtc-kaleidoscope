/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import landscapeDarkAsset from './landscape-dark.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const landscapeDark: PresetSource = Asset.fromModule(landscapeDarkAsset).uri;

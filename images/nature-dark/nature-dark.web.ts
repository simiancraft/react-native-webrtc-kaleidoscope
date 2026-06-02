/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import natureDarkAsset from './nature-dark.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const natureDark: PresetSource = Asset.fromModule(natureDarkAsset).uri;

/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import homeDarkAsset from './home-dark.webp';

// Web variant. The bundled WebP's URL, which the background-image effect fetches.
export const homeDark: PresetSource = Asset.fromModule(homeDarkAsset).uri;

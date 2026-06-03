/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import underwaterDarkAsset from './underwater-dark.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const underwaterDark: PresetSource = Asset.fromModule(underwaterDarkAsset).uri;

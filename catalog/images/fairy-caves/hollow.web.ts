/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import hollowAsset from './hollow.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const hollow: PresetSource = Asset.fromModule(hollowAsset).uri;

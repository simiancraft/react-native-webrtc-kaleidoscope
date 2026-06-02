/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import simiancraftLightAsset from './simiancraft-light.webp';

// Web variant. The bundled WebP's URL, which the background-image effect fetches.
export const simiancraftLight: PresetSource = Asset.fromModule(simiancraftLightAsset).uri;

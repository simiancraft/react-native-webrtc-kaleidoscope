/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import simiancraftDarkAsset from './simiancraft-dark.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const simiancraftDark: PresetSource = Asset.fromModule(simiancraftDarkAsset).uri;

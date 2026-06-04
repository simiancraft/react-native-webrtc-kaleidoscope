/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import officeLightAsset from './office-light.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const officeLight: PresetSource = Asset.fromModule(officeLightAsset).uri;

/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import wizardTowerNightAsset from './wizard-tower-night.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const wizardTowerNight: PresetSource = Asset.fromModule(wizardTowerNightAsset).uri;

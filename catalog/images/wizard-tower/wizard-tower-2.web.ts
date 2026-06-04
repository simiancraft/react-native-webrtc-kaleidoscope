/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import wizardTower2Asset from './wizard-tower-2.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const wizardTower2: PresetSource = Asset.fromModule(wizardTower2Asset).uri;

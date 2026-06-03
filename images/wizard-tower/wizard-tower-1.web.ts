/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import wizardTower1Asset from './wizard-tower-1.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const wizardTower1: PresetSource = Asset.fromModule(wizardTower1Asset).uri;

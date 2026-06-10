/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import wizardTower2Asset from './wizard-tower-2.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const wizardTower2: ImageSource = Asset.fromModule(wizardTower2Asset).uri;

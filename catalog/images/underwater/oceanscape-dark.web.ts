/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import oceanscapeDarkAsset from './oceanscape-dark.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const oceanscapeDark: ImageSource = Asset.fromModule(oceanscapeDarkAsset).uri;

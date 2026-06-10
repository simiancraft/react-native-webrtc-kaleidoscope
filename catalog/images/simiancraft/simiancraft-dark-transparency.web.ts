/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import simiancraftDarkTransparencyAsset from './simiancraft-dark-transparency.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const simiancraftDarkTransparency: ImageSource = Asset.fromModule(
  simiancraftDarkTransparencyAsset,
).uri;

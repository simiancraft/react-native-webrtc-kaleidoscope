/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import simiancraftLightTransparencyAsset from './simiancraft-light-transparency.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const simiancraftLightTransparency: ImageSource = Asset.fromModule(
  simiancraftLightTransparencyAsset,
).uri;

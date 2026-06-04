/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import hollowAsset from './hollow.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const hollow: ImageSource = Asset.fromModule(hollowAsset).uri;

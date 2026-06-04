/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import homeDarkAsset from './home-dark.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const homeDark: ImageSource = Asset.fromModule(homeDarkAsset).uri;

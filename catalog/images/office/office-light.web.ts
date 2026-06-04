/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import officeLightAsset from './office-light.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const officeLight: ImageSource = Asset.fromModule(officeLightAsset).uri;

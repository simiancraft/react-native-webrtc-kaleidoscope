/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import grottoAsset from './grotto.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const grotto: ImageSource = Asset.fromModule(grottoAsset).uri;

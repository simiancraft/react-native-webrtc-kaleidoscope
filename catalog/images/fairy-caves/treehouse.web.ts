/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import treehouseAsset from './treehouse.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const treehouse: ImageSource = Asset.fromModule(treehouseAsset).uri;

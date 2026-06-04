/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import treehouseAsset from './treehouse.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const treehouse: PresetSource = Asset.fromModule(treehouseAsset).uri;

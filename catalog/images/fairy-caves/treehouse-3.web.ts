/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import treehouse3Asset from './treehouse-3.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const treehouse3: PresetSource = Asset.fromModule(treehouse3Asset).uri;

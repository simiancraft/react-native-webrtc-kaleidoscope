/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import treehouse2Asset from './treehouse-2.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const treehouse2: ImageSource = Asset.fromModule(treehouse2Asset).uri;

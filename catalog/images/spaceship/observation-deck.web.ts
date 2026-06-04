/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { ImageSource } from '../image.types';
import observationDeckAsset from './observation-deck.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const observationDeck: ImageSource = Asset.fromModule(observationDeckAsset).uri;

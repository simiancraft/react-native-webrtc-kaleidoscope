/// <reference path="../assets.d.ts" />
import { Asset } from 'expo-asset';
import type { PresetSource } from '../preset-source.types';
import grottoAsset from './grotto.webp';

// Web variant. The bundled WebP's URL, which the image layer fetches.
export const grotto: PresetSource = Asset.fromModule(grottoAsset).uri;

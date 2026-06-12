// The default backing store: AsyncStorage under the canonical key. Works on
// every platform (the web build is localStorage-backed).
//
// `@react-native-async-storage/async-storage` is an OPTIONAL peer dependency of
// the package: only the `/persistence` subpath touches it, and Metro resolves
// it at bundle time for any app that imports this subpath (even with a custom
// `store`; bundlers do not tree-shake the default away).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  KALEIDOSCOPE_STATE_KEY,
  type KaleidoscopeStateStore,
  parseStoredKaleidoscopeState,
  type StoredKaleidoscopeState,
  serializeKaleidoscopeState,
} from './state';

export const kaleidoscopeAsyncStorageStore: KaleidoscopeStateStore = {
  load(): Promise<StoredKaleidoscopeState | null> {
    return AsyncStorage.getItem(KALEIDOSCOPE_STATE_KEY).then(
      parseStoredKaleidoscopeState,
      () => null,
    );
  },
  save(state: StoredKaleidoscopeState): Promise<void> {
    return AsyncStorage.setItem(KALEIDOSCOPE_STATE_KEY, serializeKaleidoscopeState(state)).then(
      () => undefined,
      (error) => {
        console.warn('kaleidoscope: preset persistence save failed', error);
      },
    );
  },
};

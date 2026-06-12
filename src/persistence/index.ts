// Subpath entry: react-native-webrtc-kaleidoscope/persistence
//
// The persisted-selection convenience: a provider + hook that keep the last
// applied preset, its control-panel patches, and the mask across launches.
// Storage-agnostic via `KaleidoscopeStateStore`; defaults to AsyncStorage
// (`@react-native-async-storage/async-storage`, an optional peer dependency
// required only by apps that use the default store).

export { kaleidoscopeAsyncStorageStore } from './async-storage-store';
export {
  KaleidoscopeStateProvider,
  type KaleidoscopeStateProviderProps,
  type KaleidoscopeStateValue,
  useKaleidoscopeState,
} from './provider';
export {
  DEFAULT_MASK,
  KALEIDOSCOPE_STATE_KEY,
  type KaleidoscopeStateStore,
  parseStoredKaleidoscopeState,
  pruneStoredState,
  type StoredKaleidoscopeState,
  type StoredLayerUniforms,
  type StoredPatch,
  type StoredPatches,
  type StoredPatchMap,
  serializeKaleidoscopeState,
} from './state';

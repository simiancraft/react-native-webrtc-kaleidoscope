// Persistence: the React surface. `KaleidoscopeStateProvider` hydrates the
// stored selection once at mount and writes through on every change;
// `useKaleidoscopeState` hands the host the hydrated values plus the setters.
//
// The provider owns STORAGE state only; it never binds a track or calls the
// verbs. The host applies the restored selection itself (gated on `hydrated`,
// so a stored preset is not flashed over by the default):
//
//   // `controls` is the binding from bindKaleidoscope(track, { presets }).
//   const { hydrated, presetId, patchesFor, mask, ... } = useKaleidoscopeState<typeof presets>();
//   useEffect(() => {
//     if (!hydrated || !controls) return;
//     // patchesFor is stable, read at apply time, so it stays out of the deps.
//     if (presetId) controls.kaleidoscope(presetId, patchesFor(presetId));
//     else controls.kaleidoscope(null);
//   }, [hydrated, controls, presetId]);
//
// The backing store defaults to AsyncStorage; pass any `KaleidoscopeStateStore`
// to swap it. Importing this subpath is what brings the optional
// `@react-native-async-storage/async-storage` peer onto your bundle path
// (Metro resolves it at bundle time either way, so there is no lazy escape).

import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { MaskInput, PatchesFor } from '../kaleidoscope/types';
import type { KaleidoscopePresetBook } from '../kaleidoscope.preset-book.types';
import { kaleidoscopeAsyncStorageStore } from './async-storage-store';
import {
  DEFAULT_MASK,
  type KaleidoscopeStateStore,
  mergePatch,
  patchListFor,
  pruneStoredState,
  type StoredPatch,
  type StoredPatches,
} from './state';

export type KaleidoscopeStateValue<P extends KaleidoscopePresetBook = KaleidoscopePresetBook> = {
  /** False until the persisted selection has been read; apply no effects before then. */
  readonly hydrated: boolean;
  /** The selected preset id, or null when nothing is selected. */
  readonly presetId: (keyof P & string) | null;
  /** The shared segmentation edge. */
  readonly mask: MaskInput;
  /** Every preset's stored per-layer overrides (keyed by preset id, then layer id). */
  readonly patches: StoredPatches;
  readonly setPreset: (presetId: (keyof P & string) | null) => void;
  readonly setMask: (mask: MaskInput) => void;
  /** Record one control-panel patch against a preset (and persist it). */
  readonly setPatch: (presetId: keyof P & string, patch: StoredPatch) => void;
  /** A preset's stored overrides in the array shape `kaleidoscope(id, patches)` takes. */
  readonly patchesFor: <K extends keyof P & string>(presetId: K) => PatchesFor<P, K>;
  /** Clear the stored selection back to defaults (and persist the cleared state). */
  readonly reset: () => void;
};

const KaleidoscopeStateContext = createContext<KaleidoscopeStateValue | null>(null);

export type KaleidoscopeStateProviderProps<P extends KaleidoscopePresetBook> = {
  /** The consumer's preset book; stored state is pruned against it at hydrate. */
  readonly presets: P;
  /** The backing store. Defaults to the AsyncStorage store (lazily loaded). */
  readonly store?: KaleidoscopeStateStore;
  /** The mask used before hydration and after `reset`. Defaults to 0.5/0.5. */
  readonly defaultMask?: MaskInput;
  readonly children: ReactNode;
};

type Selection = {
  readonly presetId: string | null;
  readonly mask: MaskInput;
  readonly patches: StoredPatches;
};

export function KaleidoscopeStateProvider<P extends KaleidoscopePresetBook>({
  presets,
  store,
  defaultMask = DEFAULT_MASK,
  children,
}: KaleidoscopeStateProviderProps<P>): ReactElement {
  const [hydrated, setHydrated] = useState(false);
  const [selection, setSelection] = useState<Selection>({
    presetId: null,
    mask: defaultMask,
    patches: {},
  });
  // A write before hydration wins over the stored value (the person acted; do
  // not clobber their fresh choice with yesterday's).
  const dirty = useRef(false);
  // Pinned for the provider's lifetime: hydrate and every write-through go to
  // the same store the first render saw.
  const storeRef = useRef(store ?? kaleidoscopeAsyncStorageStore);

  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate exactly once; the book and store are bind-time constants.
  useEffect(() => {
    let cancelled = false;
    storeRef.current.load().then(
      (stored) => {
        if (cancelled) return;
        if (stored && !dirty.current) {
          const pruned = pruneStoredState(stored, presets);
          setSelection({ presetId: pruned.presetId, mask: pruned.mask, patches: pruned.patches });
        }
        setHydrated(true);
      },
      () => {
        if (!cancelled) setHydrated(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = (next: Selection): void => {
    dirty.current = true;
    setSelection(next);
    void storeRef.current.save({ version: 1, ...next });
  };

  const value: KaleidoscopeStateValue = {
    hydrated,
    presetId: selection.presetId,
    mask: selection.mask,
    patches: selection.patches,
    setPreset: (presetId) => commit({ ...selection, presetId }),
    setMask: (mask) => commit({ ...selection, mask }),
    setPatch: (presetId, patch) =>
      commit({ ...selection, patches: mergePatch(selection.patches, presetId, patch) }),
    // The stored wire shape is book-agnostic; the typed view is recovered at the
    // hook (`useKaleidoscopeState<typeof presets>()`), so the cast is the seam.
    patchesFor: ((presetId: string) =>
      patchListFor(selection.patches, presetId)) as KaleidoscopeStateValue['patchesFor'],
    reset: () => commit({ presetId: null, mask: defaultMask, patches: {} }),
  };

  return (
    <KaleidoscopeStateContext.Provider value={value}>{children}</KaleidoscopeStateContext.Provider>
  );
}

/**
 * The persisted selection plus its setters. Typed by the consumer's book:
 * `useKaleidoscopeState<typeof presets>()`. Throws outside the provider.
 */
export function useKaleidoscopeState<
  P extends KaleidoscopePresetBook = KaleidoscopePresetBook,
>(): KaleidoscopeStateValue<P> {
  const value = useContext(KaleidoscopeStateContext);
  if (value === null) {
    throw new Error(
      'useKaleidoscopeState: no <KaleidoscopeStateProvider> above this component. ' +
        'Wrap your app (or the screen using the picker) in the provider from ' +
        "'react-native-webrtc-kaleidoscope/persistence'.",
    );
  }
  // Safe by construction: the provider pruned ids against the same book the
  // consumer parameterizes with; the runtime shapes are identical.
  return value as unknown as KaleidoscopeStateValue<P>;
}

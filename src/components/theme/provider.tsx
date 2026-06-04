// The theme provider: one context holding the flat slot bank that every control
// primitive reads to self-decorate. Mirrors the React Native Reusables
// `TextClassContext` idea, generalized to a slot map.
//
// Pass a STABLE `value` (React Compiler memoizes it on the consumer side;
// otherwise memoize it by hand): a fresh object each render re-renders every
// themed primitive.
//
// Leaf module: imports only `react` and the slot types. It must never import from
// sibling component modules or from `ui/`, so `ui/` can depend on it (the one
// allowed `ui/` -> `theme/` edge) without a cycle.

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { KaleidoscopeThemeSlots, SlotStyle, ThemeSlot } from './slots';

const EMPTY: KaleidoscopeThemeSlots = {};

const ThemeContext = createContext<KaleidoscopeThemeSlots>(EMPTY);

/**
 * Wrap the controls UI to theme every primitive at once. `value` is the slot
 * bank (`labelClassName`, `sliderStyle`, ...); memoize it at the call site.
 */
export function KaleidoscopeThemeProvider({
  value,
  children,
}: {
  readonly value?: KaleidoscopeThemeSlots;
  readonly children: ReactNode;
}) {
  return <ThemeContext.Provider value={value ?? EMPTY}>{children}</ThemeContext.Provider>;
}

/** The full slot bank from context (empty when no provider is mounted). */
export function useKaleidoscopeTheme(): KaleidoscopeThemeSlots {
  return useContext(ThemeContext);
}

/** The `{ className, style }` pair for one slot, for a primitive to merge last. */
export function useThemeSlot(slot: ThemeSlot): {
  readonly className?: string;
  readonly style?: SlotStyle;
} {
  const slots = useContext(ThemeContext);
  return {
    className: slots[`${slot}ClassName`],
    style: slots[`${slot}Style`],
  };
}

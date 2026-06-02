// The drop-in composite picker (#28): tabs over the consumer's preset families,
// each tab rendering the same uniform tile grid. Controlled selection; emit the
// chosen id, the host applies it. `usePicker` is the orchestration (group the
// book by family, own the active tab) and is exported for BYO layouts.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { PresetBook } from '../../kaleidoscope/types';
import { PickerLayout } from './layout';
import type { Family, PickerProps, PresetView } from './picker.types';
import { PresetGrid } from './presets/preset-grid';

/** The grouping usePicker returns; named so BYO-layout consumers can type it. */
export interface PickerModel {
  /** Distinct families present in the book, in first-appearance order. */
  readonly families: ReadonlyArray<Family>;
  /** Flattened presets per family. */
  readonly viewsByFamily: ReadonlyMap<Family, ReadonlyArray<PresetView>>;
  /** The reconciled active family (survives a changed book; falls back to the first). */
  readonly activeTab: Family | undefined;
  /** Set the active family tab. */
  readonly setActiveTab: (family: Family) => void;
}

/**
 * Tabbed, preset-book-driven picker. Controlled selection; emits the chosen id
 * and the host applies it.
 *
 * @example
 * <KaleidoscopePicker
 *   presets={presets}
 *   value={art}
 *   onSelect={setArt}
 * />
 */
export function KaleidoscopePicker<P extends PresetBook>(props: PickerProps<P>) {
  // `className` (declared on PickerProps) is intentionally not destructured: the
  // ./nativewind cssInterop registration consumes it at the JSX boundary and
  // merges the resolved classes into `style` before this body runs.
  const {
    presets,
    value,
    onSelect,
    disabled = false,
    renderTile,
    labelFor,
    tabLabelFor,
    style,
  } = props;
  const { families, viewsByFamily, activeTab, setActiveTab } = usePicker(presets, labelFor);

  if (!activeTab) return null;
  const views = viewsByFamily.get(activeTab) ?? [];
  // The renderers speak string ids (PresetView.id); the public onSelect is
  // narrowed to keyof P. Adapt once here so consumers need no cast (every id
  // came from Object.keys(presets), so it is a real key).
  const handleSelect = (id: string | null) => onSelect(id as (keyof P & string) | null);

  return (
    <PickerLayout
      style={style}
      tabsZone={families.map((family) => (
        <Tab
          key={family}
          label={tabLabelFor?.(family) ?? titleCase(family)}
          active={family === activeTab}
          disabled={disabled}
          onPress={() => setActiveTab(family)}
        />
      ))}
      bodyZone={
        <PresetGrid
          presets={views}
          value={value}
          onSelect={handleSelect}
          disabled={disabled}
          renderTile={renderTile}
        />
      }
    />
  );
}

/**
 * Group a preset book into families and own the active tab. Off the React
 * Compiler in this package, so the grouping is memoized by hand on
 * `[presets, labelFor]`; a consumer passing an inline `labelFor` busts it (pass
 * a stable reference to keep it). The active tab is reconciled every render:
 * it survives as long as its family is still in the book, else it falls back to
 * the first family — so swapping `presets` can't strand a dead tab.
 */
export function usePicker<P extends PresetBook>(
  presets: P,
  labelFor?: (id: keyof P & string) => string,
): PickerModel {
  const { families, viewsByFamily } = useMemo(() => {
    const fams: Family[] = [];
    const byFamily = new Map<Family, PresetView[]>();
    for (const id of Object.keys(presets)) {
      const preset = presets[id];
      if (!preset) continue;
      const family = preset.category;
      const view: PresetView = {
        id,
        label: labelFor?.(id as keyof P & string) ?? preset.name,
        family,
        source: typeof preset.thumbnail === 'string' ? preset.thumbnail : undefined,
      };
      if (!byFamily.has(family)) {
        fams.push(family);
        byFamily.set(family, []);
      }
      byFamily.get(family)?.push(view);
    }
    return { families: fams, viewsByFamily: byFamily };
  }, [presets, labelFor]);

  const [activeTab, setActiveTab] = useState<Family | undefined>(undefined);
  const active = activeTab && families.includes(activeTab) ? activeTab : families[0];
  return { families, viewsByFamily, activeTab: active, setActiveTab };
}

interface TabProps {
  readonly label: string;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

function Tab({ label, active, disabled, onPress }: TabProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive, disabled && styles.tabDisabled]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function titleCase(s: string): string {
  return s
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const styles = StyleSheet.create({
  tab: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#1f1f1f' },
  tabActive: { backgroundColor: '#333' },
  tabDisabled: { opacity: 0.5 },
  tabLabel: { color: '#999', fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: '#fff' },
});

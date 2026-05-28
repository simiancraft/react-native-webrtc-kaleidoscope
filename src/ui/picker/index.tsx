// The drop-in composite picker (#28): tabs over the consumer's preset families,
// each tab rendering a family-appropriate control. Controlled selection; emit
// the chosen id, the host applies it. `usePicker` is the orchestration (group
// the book by family, own the active tab) and is exported for BYO layouts.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { PresetBook } from '../../kaleidoscope/types';
import { PickerLayout } from './layout';
import type { Family, PickerProps, PresetView, RenderOption, RenderTile } from './picker.types';
import { BackgroundGrid } from './presets/background-grid';
import { PresetOptions } from './presets/preset-options';

// The single family rendered as image tiles. Centralized so the two places that
// switch on it — the source extraction in usePicker and the renderer routing in
// FamilyBody — can't drift; a future second tile-family changes only this seam.
const TILE_FAMILY = 'background-image' as const;

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

export function KaleidoscopePicker<P extends PresetBook>(props: PickerProps<P>) {
  const {
    presets,
    value,
    onSelect,
    disabled = false,
    renderTile,
    renderOption,
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
        <FamilyBody
          family={activeTab}
          views={views}
          value={value}
          onSelect={handleSelect}
          disabled={disabled}
          renderTile={renderTile}
          renderOption={renderOption}
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
      const family = preset.shader;
      const source = preset.shader === TILE_FAMILY ? preset.options.source : undefined;
      const view: PresetView = {
        id,
        label: labelFor?.(id as keyof P & string) ?? titleCase(id),
        family,
        source: typeof source === 'string' ? source : undefined,
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

interface FamilyBodyProps {
  readonly family: Family;
  readonly views: ReadonlyArray<PresetView>;
  readonly value: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly disabled: boolean;
  readonly renderTile?: RenderTile;
  readonly renderOption?: RenderOption;
}

function FamilyBody(props: FamilyBodyProps) {
  const { family, views, value, onSelect, disabled, renderTile, renderOption } = props;
  // Family -> control dispatch. Only TILE_FAMILY renders as a thumbnail grid;
  // every other family is option buttons. A third control shape would turn this
  // into a lookup table keyed on family — premature for the current set.
  if (family === TILE_FAMILY) {
    return (
      <BackgroundGrid
        presets={views}
        value={value}
        onSelect={onSelect}
        disabled={disabled}
        renderTile={renderTile}
      />
    );
  }
  return (
    <PresetOptions
      presets={views}
      value={value}
      onSelect={onSelect}
      disabled={disabled}
      renderOption={renderOption}
    />
  );
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

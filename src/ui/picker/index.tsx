// The drop-in composite picker (#28): tabs over the consumer's preset families,
// each tab rendering a family-appropriate control. Controlled selection; emit
// the chosen id, the host applies it. `usePicker` is the orchestration (group
// the book by family, own the active tab) and is exported for BYO layouts.

import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { PresetBook } from '../../kaleidoscope/types';
import { PickerLayout } from './layout';
import type { Family, PickerProps, PresetView, RenderOption, RenderTile } from './picker.types';
import { BackgroundGrid } from './presets/background-grid';
import { PresetOptions } from './presets/preset-options';

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
  } = props;
  const { families, viewsByFamily, activeTab, setActiveTab } = usePicker(presets, labelFor);

  const active = activeTab ?? families[0];
  if (!active) return null;
  const views = viewsByFamily.get(active) ?? [];

  return (
    <PickerLayout
      tabsZone={families.map((family) => (
        <Tab
          key={family}
          label={tabLabelFor?.(family) ?? titleCase(family)}
          active={family === active}
          disabled={disabled}
          onPress={() => setActiveTab(family)}
        />
      ))}
      bodyZone={
        <FamilyBody
          family={active}
          views={views}
          value={value}
          onSelect={onSelect}
          disabled={disabled}
          renderTile={renderTile}
          renderOption={renderOption}
        />
      }
    />
  );
}

/** Group a preset book into families and own the active tab. */
export function usePicker<P extends PresetBook>(presets: P, labelFor?: (id: string) => string) {
  const families: Family[] = [];
  const viewsByFamily = new Map<Family, PresetView[]>();
  for (const id of Object.keys(presets)) {
    const preset = presets[id];
    if (!preset) continue;
    const family = preset.shader;
    const source = preset.shader === 'background-image' ? preset.options.source : undefined;
    const view: PresetView = {
      id,
      label: labelFor?.(id) ?? titleCase(id),
      family,
      source: typeof source === 'string' ? source : undefined,
    };
    if (!viewsByFamily.has(family)) {
      families.push(family);
      viewsByFamily.set(family, []);
    }
    viewsByFamily.get(family)?.push(view);
  }
  const [activeTab, setActiveTab] = useState<Family | undefined>(families[0]);
  return { families, viewsByFamily, activeTab, setActiveTab };
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
  if (family === 'background-image') {
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

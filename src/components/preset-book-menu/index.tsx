// The drop-in composite picker (#28): tabs over the consumer's preset families,
// a left-hand category menu under the tabs, and a uniform tile grid filtered by
// the active family and category. Controlled selection; emit the chosen id, the
// host applies it. `usePresetBookMenu` is the orchestration (group the book by
// family/category, own the active tab and category) and is exported for BYO
// layouts.

import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import type { KaleidoscopePresetBook } from '../../kaleidoscope.preset-book.types';
import { categoryTestId, familyTestId } from '../../lib/test-id';
import { PresetBookMenuLayout } from './layout';
import type { Category, Family, PresetBookMenuProps, PresetView } from './preset-book-menu.types';
import { PresetGrid } from './preset-grid';

/** The grouping usePresetBookMenu returns; named so BYO-layout consumers can type it. */
export interface PresetBookMenuModel {
  /** Distinct families present in the book, in first-appearance order. */
  readonly families: ReadonlyArray<Family>;
  /** The reconciled active family (survives a changed book; falls back to the first). */
  readonly activeTab: Family | undefined;
  /** Set the active family tab. */
  readonly setActiveTab: (family: Family) => void;
  /**
   * Categories (taxonomy[1]) within the active family, first-appearance order.
   * Empty when the family is flat (every preset is depth-1).
   */
  readonly categories: ReadonlyArray<Category>;
  /** The reconciled active category, or undefined when the family is flat. */
  readonly activeCategory: Category | undefined;
  /** Set the active category. */
  readonly setActiveCategory: (category: Category) => void;
  /**
   * Presets to display: the active family narrowed to the active category, or
   * every preset in the family when it is flat.
   */
  readonly views: ReadonlyArray<PresetView>;
}

/**
 * Tabbed, preset-book-driven picker. Controlled selection; emits the chosen id
 * and the host applies it.
 *
 * @example
 * <PresetBookMenu
 *   presets={presets}
 *   value={art}
 *   onSelect={setArt}
 * />
 */
export function PresetBookMenu<P extends KaleidoscopePresetBook>(props: PresetBookMenuProps<P>) {
  // `className` (declared on PresetBookMenuProps) is intentionally not destructured: the
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
    categoryLabelFor,
    style,
  } = props;
  const {
    families,
    activeTab,
    setActiveTab,
    categories,
    activeCategory,
    setActiveCategory,
    views,
  } = usePresetBookMenu(presets, labelFor);

  if (!activeTab) return null;
  // The renderers speak string ids (PresetView.id); the public onSelect is
  // narrowed to keyof P. Adapt once here so consumers need no cast (every id
  // came from Object.keys(presets), so it is a real key).
  const handleSelect = (id: string | null) => onSelect(id as (keyof P & string) | null);

  return (
    <PresetBookMenuLayout
      style={style}
      tabsZone={families.map((family) => (
        <Tab
          key={family}
          label={tabLabelFor?.(family) ?? titleCase(family)}
          active={family === activeTab}
          disabled={disabled}
          onPress={() => setActiveTab(family)}
          testID={familyTestId(family)}
        />
      ))}
      sidebarZone={
        categories.length > 0
          ? categories.map((category) => (
              <CategoryItem
                key={category}
                label={categoryLabelFor?.(category) ?? category}
                active={category === activeCategory}
                disabled={disabled}
                onPress={() => setActiveCategory(category)}
                testID={categoryTestId(activeTab, category)}
              />
            ))
          : undefined
      }
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
 * Group a preset book by family and category, and own the active tab and
 * category. The grouping is plain — no hand-rolled memo: React Compiler memoizes
 * it when the library is compiled, and it is cheap to recompute otherwise. The
 * active tab and category are reconciled every render: each survives as long as
 * it is still in the book, else it falls back to the first; so swapping
 * `presets`, or switching to a family that lacks the prior category, can't strand
 * a dead selection.
 */
export function usePresetBookMenu<P extends KaleidoscopePresetBook>(
  presets: P,
  labelFor?: (id: keyof P & string) => string,
): PresetBookMenuModel {
  const families: Family[] = [];
  const viewsByFamily = new Map<Family, PresetView[]>();
  const categoriesByFamily = new Map<Family, Category[]>();
  const viewsByFamilyCategory = new Map<Family, Map<Category, PresetView[]>>();
  for (const id of Object.keys(presets)) {
    const preset = presets[id];
    if (!preset) continue;
    // taxonomy[0] is the family (tab); taxonomy[1], when present, is the
    // category (left-hand menu). A depth-1 preset has no category.
    const family = preset.taxonomy[0];
    const category = preset.taxonomy[1];
    const view: PresetView = {
      id,
      label: labelFor?.(id as keyof P & string) ?? preset.name,
      family,
      category,
      source:
        typeof preset.thumbnail === 'string' || typeof preset.thumbnail === 'number'
          ? preset.thumbnail
          : undefined,
    };
    if (!viewsByFamily.has(family)) {
      families.push(family);
      viewsByFamily.set(family, []);
      categoriesByFamily.set(family, []);
      viewsByFamilyCategory.set(family, new Map());
    }
    viewsByFamily.get(family)?.push(view);
    if (category !== undefined) {
      const cats = categoriesByFamily.get(family);
      const catViews = viewsByFamilyCategory.get(family);
      if (cats && catViews && !catViews.has(category)) {
        cats.push(category);
        catViews.set(category, []);
      }
      catViews?.get(category)?.push(view);
    }
  }

  const [activeTab, setActiveTab] = useState<Family | undefined>(undefined);
  const family = activeTab && families.includes(activeTab) ? activeTab : families[0];
  const categories = (family && categoriesByFamily.get(family)) || [];

  const [activeCategory, setActiveCategory] = useState<Category | undefined>(undefined);
  const category =
    activeCategory && categories.includes(activeCategory) ? activeCategory : categories[0];

  const views = category
    ? (family && viewsByFamilyCategory.get(family)?.get(category)) || []
    : (family && viewsByFamily.get(family)) || [];

  return {
    families,
    activeTab: family,
    setActiveTab,
    categories,
    activeCategory: category,
    setActiveCategory,
    views,
  };
}

interface TabProps {
  readonly label: string;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

function Tab({ label, active, disabled, onPress, testID }: TabProps) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive, disabled && styles.tabDisabled]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

interface CategoryItemProps {
  readonly label: string;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

function CategoryItem({ label, active, disabled, onPress, testID }: CategoryItemProps) {
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active, disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.category,
        active && styles.categoryActive,
        disabled && styles.categoryDisabled,
      ]}
    >
      <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{label}</Text>
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
  category: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
  },
  categoryActive: { backgroundColor: '#2c2c2c' },
  categoryDisabled: { opacity: 0.5 },
  categoryLabel: { color: '#9a9a9a', fontSize: 12, fontWeight: '500' },
  categoryLabelActive: { color: '#fff' },
});

export { PresetTile } from '../preset-tile';
// The `./picker` subpath barrel: the chassis above plus the composable parts and
// types a consumer can use to build a BYO layout.
export { PresetBookMenuLayout } from './layout';
export type {
  Category,
  Family,
  PresetBookMenuProps,
  PresetBookMenuSelection,
  PresetBookMenuStyleProps,
  PresetItemState,
  PresetView,
  RenderTile,
} from './preset-book-menu.types';
export { PresetGrid } from './preset-grid';

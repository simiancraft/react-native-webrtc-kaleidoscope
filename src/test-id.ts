// The test-id grammar: pure builders for the deterministic, semantic
// `accessibilityIdentifier`s every interactive kit leaf carries. One source of
// truth so a Maestro flow can address a control by a stable id instead of its
// brittle visible text. No React/RN import; this is plain data.
//
// Shape (dot-delimited, rooted at `kld`):
//   control field   kld.<preset>.<layer>.<uniform>      (+ .r/.g/.b per channel)
//   transform       kld.transform.rotate-90 | flip-x
//   mask            kld.mask.hardness
//   family tab      kld.family.<slug>
//   category item   kld.category.<slug-family>.<slug-category>
//   preset tile     kld.preset.<id>
//
// preset/layer/uniform ids and book keys are already stable tokens and are used
// verbatim; only display strings (family, category) are slugged.

export const TESTID_ROOT = 'kld';

/** Default static prefixes for the two control families that have no preset scope. */
export const TRANSFORM_TESTID_PREFIX = `${TESTID_ROOT}.transform`;
export const MASK_TESTID_PREFIX = `${TESTID_ROOT}.mask`;

/**
 * Normalize a display string to a stable id segment: lowercase, spaces and
 * underscores to `-`, drop anything outside `[a-z0-9-]`, collapse repeats, trim.
 */
export function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The scope a ControlForm's fields hang off: `kld.<preset>.<layer>`, or
 * `kld.<layer>` when rendered standalone (no Tuner provides a preset).
 */
export function controlScope(presetId: string | null, layerId: string): string {
  return presetId ? `${TESTID_ROOT}.${presetId}.${layerId}` : `${TESTID_ROOT}.${layerId}`;
}

/** One field's id within its form scope: `<scope>.<uniform>`. */
export function fieldTestId(scope: string, uniform: string): string {
  return `${scope}.${uniform}`;
}

/** A rotation button: `<prefix>.rotate-<deg>`. */
export function rotateTestId(prefix: string, deg: number): string {
  return `${prefix}.rotate-${deg}`;
}

/** A flip toggle: `<prefix>.flip-<axis>`. */
export function flipTestId(prefix: string, axis: 'x' | 'y'): string {
  return `${prefix}.flip-${axis}`;
}

/** A family tab: `kld.family.<slug>`. */
export function familyTestId(family: string): string {
  return `${TESTID_ROOT}.family.${slug(family)}`;
}

/**
 * A category menu item, qualified by its family so the same label under two
 * families does not collide: `kld.category.<slug-family>.<slug-category>`.
 */
export function categoryTestId(family: string, category: string): string {
  return `${TESTID_ROOT}.category.${slug(family)}.${slug(category)}`;
}

/** A preset tile: `kld.preset.<id>` (id is the book key, already a stable token). */
export function presetTileTestId(id: string): string {
  return `${TESTID_ROOT}.preset.${id}`;
}

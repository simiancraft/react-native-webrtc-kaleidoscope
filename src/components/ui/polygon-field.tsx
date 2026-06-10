// PolygonField: editor for a `kind: 'polygon'` uniform (a vec2 array, stored flat
// as [x0,y0, x1,y1, ...]). It is COMPOSED OF POINTS: one <Point> editor per vertex,
// laid out in a SPATIAL GRID rather than a flat row, so the editors sit where their
// corners are. With the row-major corner convention (p0=TL, p1=TR, p2=BL, p3=BR), a
// 2-column grid puts each editor in its quad position: top-left edits the top-left
// corner. The grid is √-shaped (cols = ceil(√points)), so a 4-point polygon is 2x2.
// Self-wires the flat array via `useField`; each Point writes back its (x, y) slice.

import { StyleSheet, View } from 'react-native';
import { useField } from '../form/use-field';
import { Label } from './label';
import { Point } from './point';

/** Editing range for both axes; shaft anchors sit slightly off-screen (-0.2..1.2). */
const RANGE_MIN = -0.2;
const RANGE_MAX = 1.2;

export type PolygonFieldProps = {
  /** The uniform key this field drives: a vec2 array, flat [x0,y0, x1,y1, ...]. */
  readonly uniform: string;
  /** Number of polygon vertices; laid out in a ceil(√points)-column grid. */
  readonly points: number;
  /** Display name; defaults to the uniform key. */
  readonly label?: string;
};

export function PolygonField({ uniform, points, label }: PolygonFieldProps) {
  const field = useField(uniform);
  const flat = Array.isArray(field.value) ? field.value : [];
  const name = label ?? uniform;

  const setPoint = (p: number, x: number, y: number) => {
    const next = flat.slice();
    while (next.length < points * 2) next.push(0);
    next[p * 2] = x;
    next[p * 2 + 1] = y;
    field.onChange(next);
  };

  // Spatial grid: cols = ceil(√points) (2 for a quad), filled row-major so vertex
  // order maps to grid position. Array.from callbacks (not mutated for-counters)
  // keep the per-Point onChange closures off the React Compiler's bail list.
  const cols = Math.max(1, Math.ceil(Math.sqrt(points)));
  const rowCount = Math.ceil(points / cols);

  return (
    <View style={styles.wrap}>
      <Label>{name}</Label>
      <View style={styles.grid}>
        {Array.from({ length: rowCount }, (_, r) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: grid rows are positional and fixed in count.
            key={r}
            style={styles.gridRow}
          >
            {Array.from({ length: cols }, (_, ci) => {
              const p = r * cols + ci;
              if (p >= points) return null;
              return (
                <Point
                  key={p}
                  x={flat[p * 2] ?? 0}
                  y={flat[p * 2 + 1] ?? 0}
                  min={RANGE_MIN}
                  max={RANGE_MAX}
                  label={`p${p}`}
                  disabled={field.disabled}
                  testID={`${field.testID}.${p}`}
                  onChange={(x, y) => setPoint(p, x, y)}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  grid: { gap: 8, alignSelf: 'flex-start' },
  gridRow: { flexDirection: 'row', gap: 8 },
});

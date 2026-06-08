// PolygonField: editor for a `kind: 'polygon'` uniform (a vec2 array, stored flat
// as [x0,y0, x1,y1, ...]). PROTOTYPE: it renders an x/y slider per point on one
// row; a draggable XY-plane editor replaces this later without touching the
// uniform shape (the data is already the polygon). Self-wires via `useField`.

import RNSlider from '@react-native-community/slider';
import { StyleSheet, View } from 'react-native';
import { useField } from '../form/use-field';
import { Label } from './label';
import { Readout } from './readout';
import { SLIDER_TINTS, safeSliderValue } from './slider-value';

export type PolygonFieldProps = {
  /** The uniform key this field drives: a vec2 array, flat [x0,y0, x1,y1, ...]. */
  readonly uniform: string;
  /** Number of polygon vertices; the editor shows points*2 sliders (x,y each). */
  readonly points: number;
  /** Display name; defaults to the uniform key. */
  readonly label?: string;
};

export function PolygonField({ uniform, points, label }: PolygonFieldProps) {
  const field = useField(uniform);
  const flat = Array.isArray(field.value) ? field.value : [];
  const name = label ?? uniform;

  const setComponent = (idx: number, v: number) => {
    const next = flat.slice();
    while (next.length < points * 2) next.push(0);
    next[idx] = v;
    field.onChange(next);
  };

  const cells = [];
  for (let p = 0; p < points; p++) {
    for (let axis = 0; axis < 2; axis++) {
      const idx = p * 2 + axis;
      const value = flat[idx] ?? 0;
      cells.push(
        <View key={idx} style={styles.cell}>
          <Readout>{(axis === 0 ? 'x' : 'y') + p}</Readout>
          <RNSlider
            style={styles.slider}
            testID={`${field.testID}.${idx}`}
            accessibilityLabel={`${name} point ${p} ${axis === 0 ? 'x' : 'y'}`}
            minimumValue={-0.2}
            maximumValue={1.2}
            step={0.01}
            value={safeSliderValue(value)}
            disabled={field.disabled}
            onValueChange={(nv) => setComponent(idx, nv)}
            {...SLIDER_TINTS}
          />
        </View>,
      );
    }
  }

  return (
    <View style={styles.wrap}>
      <Label>{name}</Label>
      <View style={styles.row}>{cells}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 96, flex: 1 },
  slider: { flex: 1, height: 24 },
});

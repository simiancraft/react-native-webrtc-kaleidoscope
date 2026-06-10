// Point: a presentational (x, y) coordinate editor. A square box with a dot drawn
// at the point's position, plus two HORIZONTAL sliders labeled X and Y. (A rotated
// "vertical" slider renders upright but still drags side-to-side on RN-web, which
// reads as broken; two plain horizontal sliders are honest.) The box gives the
// spatial feedback the vertical axis would have: the dot tracks (x, y) live, x
// left-to-right and y bottom-to-top (y-up, matching the shaders).
//
// Presentational on purpose: it owns no field, just `{ x, y, onChange }`. The
// self-wiring lives in the container that drives it (PolygonField slices a vec2
// array into one Point per vertex). Reusable for anything that is an xy coordinate
// (a point light, a focal point).

import RNSlider from '@react-native-community/slider';
import { StyleSheet, View } from 'react-native';
import { Readout } from './readout';
import { SLIDER_TINTS, safeSliderValue } from './slider-value';

const BOX = 56;

export type PointProps = {
  /** Current x, in [min, max]. */
  readonly x: number;
  /** Current y, in [min, max]; drawn bottom-to-top (y-up). */
  readonly y: number;
  /** Slider range for both axes. */
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  /** Emitted on either axis change with the full (x, y). */
  readonly onChange: (x: number, y: number) => void;
  /** Short caption above the box (e.g. the vertex index). */
  readonly label?: string;
  readonly disabled?: boolean;
  /** Base test id; the x slider appends `.x`, the y slider `.y`. */
  readonly testID?: string;
};

export function Point({
  x,
  y,
  min,
  max,
  step = 0.01,
  onChange,
  label,
  disabled,
  testID,
}: PointProps) {
  const span = max - min || 1;
  const xFrac = Math.min(1, Math.max(0, (x - min) / span));
  const yFrac = Math.min(1, Math.max(0, (y - min) / span));
  return (
    <View style={styles.wrap}>
      {label ? <Readout>{label}</Readout> : null}
      <View style={styles.box}>
        <View
          style={[styles.dot, { left: `${xFrac * 100}%`, top: `${(1 - yFrac) * 100}%` }]}
          pointerEvents="none"
        />
      </View>
      <View style={styles.axis}>
        <Readout>X</Readout>
        <RNSlider
          style={styles.slider}
          testID={testID ? `${testID}.x` : undefined}
          accessibilityLabel={label ? `${label} x` : 'x'}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={safeSliderValue(x)}
          disabled={disabled}
          onValueChange={(v) => onChange(v, y)}
          {...SLIDER_TINTS}
        />
      </View>
      <View style={styles.axis}>
        <Readout>Y</Readout>
        <RNSlider
          style={styles.slider}
          testID={testID ? `${testID}.y` : undefined}
          accessibilityLabel={label ? `${label} y` : 'y'}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={safeSliderValue(y)}
          disabled={disabled}
          onValueChange={(v) => onChange(x, v)}
          {...SLIDER_TINTS}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3, width: BOX + 44 },
  box: {
    width: BOX,
    height: BOX,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    marginLeft: -3.5,
    marginTop: -3.5,
    backgroundColor: '#fff',
  },
  axis: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch' },
  slider: { flex: 1, height: 28 },
});

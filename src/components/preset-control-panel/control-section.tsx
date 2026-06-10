// ControlSection: the shared chrome every control group wears (a title + a
// controls slot + a web-only copy button). Rendered INSIDE a ControlForm so the
// copy button can read that form's live view model and serialize it.
//
// Copy is a desktop tweak-then-paste-into-a-preset workflow: the button renders
// only on web (Platform.OS), writes via navigator.clipboard, and depends on no
// clipboard module. Native intentionally has no copy button.

import type { ReactNode } from 'react';
import { useContext } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ControlFormContext, type FieldValue } from '../form/control-form';
import { useThemeSlot } from '../theme/provider';
import { Button } from '../ui/button';

type Values = Readonly<Record<string, FieldValue>>;

// Round off float noise (drag jitter, the slider epsilon) and snap near-zero to
// a true 0 so the pasted JSON reads as intended.
const round = (n: number): number => {
  const r = Math.round(n * 1e4) / 1e4;
  return Math.abs(r) < 1e-4 ? 0 : r;
};

const roundForCopy = (values: Values): Record<string, FieldValue> => {
  const out: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = Array.isArray(v) ? v.map(round) : round(v as number);
  }
  return out;
};

// Web-only clipboard write, typed off globalThis so it needs no DOM lib and is a
// no-op anywhere `navigator.clipboard` is absent.
const writeClipboard = (text: string): void => {
  const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => unknown } } })
    .navigator;
  nav?.clipboard?.writeText?.(text);
};

export type ControlSectionProps = {
  readonly title: string;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
};

export function ControlSection({ title, children, style }: ControlSectionProps) {
  const form = useContext(ControlFormContext);
  const { style: themeStyle } = useThemeSlot('section');
  const canCopy = Platform.OS === 'web' && form !== null;
  return (
    <View style={[styles.section, themeStyle as StyleProp<ViewStyle>, style]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {canCopy && form ? (
          <Button
            testID={`${form.path}.copy`}
            onPress={() =>
              writeClipboard(`${title}: ${JSON.stringify(roundForCopy(form.values), null, 2)}`)
            }
          >
            copy
          </Button>
        ) : null}
      </View>
      <View>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

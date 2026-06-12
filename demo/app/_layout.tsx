import { Stack } from 'expo-router';
import { registerKaleidoscopeNativeWind } from 'react-native-webrtc-kaleidoscope/nativewind';
import { KaleidoscopeStateProvider } from 'react-native-webrtc-kaleidoscope/persistence';
import { presets } from '../kaleidoscope.preset-book';
import '../global.css';

// Turn on NativeWind className support for the library picker components. Core
// RN components are handled by the babel/jsxImportSource setup; this registers
// the library's components via cssInterop so they accept className too.
registerKaleidoscopeNativeWind();

// The demo's house mask edge (the provider's own default is 0.5/0.5). Used
// before hydration and after Reset.
const DEMO_MASK = { hardness: 0.6, threshold: 0.75 };

export default function RootLayout() {
  return (
    <KaleidoscopeStateProvider presets={presets} defaultMask={DEMO_MASK}>
      <Stack screenOptions={{ headerShown: false }} />
    </KaleidoscopeStateProvider>
  );
}

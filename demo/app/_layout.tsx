import { Stack } from 'expo-router';
import { registerKaleidoscopeNativeWind } from 'react-native-webrtc-kaleidoscope/nativewind';
import '../global.css';

// Turn on NativeWind className support for the library picker components. Core
// RN components are handled by the babel/jsxImportSource setup; this registers
// the library's components via cssInterop so they accept className too.
registerKaleidoscopeNativeWind();

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

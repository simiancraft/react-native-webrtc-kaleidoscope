import fs from 'node:fs';
import path from 'node:path';

// A sentinel comment lets us find our own injection on re-prebuilds and stay
// idempotent regardless of how Expo regenerates the surrounding Podfile.
const SENTINEL = '# react-native-webrtc-kaleidoscope: modular headers (managed)';

/** The resolved react-native-webrtc fork: its CocoaPods name + npm package dir. */
export type WebrtcPod = { readonly podName: string; readonly packageDir: string };

/**
 * Resolve which react-native-webrtc fork the consumer installed, and return its
 * CocoaPods pod name + npm package directory (used to build the `:path` for the
 * Podfile declaration). Two forks ship the same surface under different names
 * (mirrors the dual probe in android/build.gradle):
 *   - @livekit/react-native-webrtc -> pod `livekit-react-native-webrtc`
 *   - react-native-webrtc          -> pod `react-native-webrtc`
 * Prefer the fork when both are present, matching the Swift import order. We
 * return null (and skip patching) when neither is found, since declaring a pod
 * for an uninstalled package would break `pod install`.
 */
export function resolveWebrtcPod(projectRoot: string | undefined): WebrtcPod | null {
  if (!projectRoot) {
    return { podName: 'react-native-webrtc', packageDir: 'react-native-webrtc' };
  }
  const fork = path.join(projectRoot, 'node_modules', '@livekit', 'react-native-webrtc');
  const upstream = path.join(projectRoot, 'node_modules', 'react-native-webrtc');
  if (fs.existsSync(fork)) {
    return { podName: 'livekit-react-native-webrtc', packageDir: '@livekit/react-native-webrtc' };
  }
  if (fs.existsSync(upstream)) {
    return { podName: 'react-native-webrtc', packageDir: 'react-native-webrtc' };
  }
  return null;
}

/**
 * Ensure the Podfile builds the resolved react-native-webrtc pod with modular
 * headers so our Swift can `import` it as a Clang module. Declares with an
 * explicit `:path` (instead of a bare `pod 'name'`) so the build works even when
 * RN autolinking does not register the pod for us. Idempotent: running prebuild
 * twice neither duplicates the line nor corrupts the Podfile.
 */
export function patchPodfile(contents: string, pod: WebrtcPod): string {
  if (contents.includes(SENTINEL)) return contents;

  const block = `${SENTINEL}\n  pod '${pod.podName}', :path => '../node_modules/${pod.packageDir}', :modular_headers => true`;
  const lines = contents.split('\n');

  // Insert just inside the first `target ... do` block so the per-pod
  // declaration sits in the same scope as the autolinked React Native pods.
  const targetIndex = lines.findIndex((line) => /^\s*target\s+['"].*['"]\s+do\b/.test(line));
  if (targetIndex !== -1) {
    lines.splice(targetIndex + 1, 0, block);
    return lines.join('\n');
  }

  // No `target` block found (unexpected for an Expo-generated Podfile); append
  // the declaration so the build requirement is at least present.
  return `${contents.trimEnd()}\n${block}\n`;
}

// Local MediaStream from getUserMedia. Web only for now; native is a no-op
// placeholder until Commit 9 lands react-native-webrtc's mediaDevices wrapper.

import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type StreamState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; stream: MediaStream }
  | { status: 'error'; error: Error };

export const useLoopbackStream = (): StreamState => {
  const [state, setState] = useState<StreamState>({ status: 'idle' });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // TODO(Commit 9): hook up react-native-webrtc's mediaDevices.getUserMedia.
      return;
    }

    let cancelled = false;
    let acquired: MediaStream | null = null;

    setState({ status: 'pending' });

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((stream) => {
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        acquired = stream;
        setState({ status: 'ready', stream });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
      });

    return () => {
      cancelled = true;
      if (acquired) {
        for (const t of acquired.getTracks()) t.stop();
      }
    };
  }, []);

  return state;
};

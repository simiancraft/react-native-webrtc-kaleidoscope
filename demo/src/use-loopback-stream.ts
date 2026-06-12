// Local MediaStream from getUserMedia, native variant. Uses
// react-native-webrtc's mediaDevices on iOS / Android. Metro resolves the
// .web.ts sibling for the web target.
//
// Re-acquisition on resume (issue #52): Android can kill camera frame delivery
// while the app is backgrounded (observed as `EglRenderer ... Frames received:
// 0` from resume onward), and nothing in the stack restarts capture: the
// capturer does not self-heal, react-native-webrtc has no app-lifecycle
// handling on its track path, and a preset change does not touch the source.
// The deterministic recovery is to re-acquire the stream whenever the app
// returns from the background. The swap propagates as a NEW stream/track, so
// the host re-binds effects and re-applies its selection; a healthy resume
// pays one brief preview restart.

import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { type MediaStream, mediaDevices } from 'react-native-webrtc';

type StreamState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'ready'; stream: MediaStream }
  | { status: 'error'; error: Error };

export const useLoopbackStream = (): StreamState => {
  const [state, setState] = useState<StreamState>({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    let acquired: MediaStream | null = null;

    const stopAcquired = () => {
      if (acquired) {
        for (const t of acquired.getTracks()) t.stop();
        acquired = null;
      }
    };

    const acquire = () => {
      setState({ status: 'pending' });
      mediaDevices
        .getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then((raw) => {
          const stream = raw as unknown as MediaStream;
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
    };

    acquire();

    // Re-acquire on background -> active. 'inactive' flickers (permission
    // dialogs, notification shade) don't count; only a real background trip
    // triggers the swap.
    let wasBackgrounded = false;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        wasBackgrounded = true;
        return;
      }
      if (next === 'active' && wasBackgrounded && !cancelled) {
        wasBackgrounded = false;
        stopAcquired();
        acquire();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
      stopAcquired();
    };
  }, []);

  return state;
};

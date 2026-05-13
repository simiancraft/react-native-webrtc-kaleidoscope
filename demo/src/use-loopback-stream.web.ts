// Local MediaStream from getUserMedia, web variant. Metro picks this file
// for the web target via the .web.ts extension; the default
// use-loopback-stream.ts handles native.

import { useEffect, useState } from 'react';

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

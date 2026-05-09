// Web video preview. Renders a raw <video> element via React DOM (react-native-web
// happily forwards unknown JSX through to the DOM at the web target). Sets the
// element's srcObject to a single-track MediaStream built from the supplied
// MediaStreamTrack so attaching/detaching effect-pipeline tracks just works.

import { useEffect, useRef } from 'react';

type Props = {
  track: MediaStreamTrack | null;
};

export const VideoPreview = ({ track }: Props) => {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!track) {
      el.srcObject = null;
      return;
    }
    el.srcObject = new MediaStream([track]);
    void el.play().catch(() => {
      // Autoplay can be blocked until the user interacts; the toggle button click
      // counts as interaction, so subsequent plays succeed.
    });
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        aspectRatio: '4 / 3',
        backgroundColor: '#1a1a1a',
        borderRadius: 8,
        objectFit: 'cover',
      }}
    />
  );
};

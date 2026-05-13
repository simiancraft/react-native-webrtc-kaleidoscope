// Web video preview. Renders the track via an HTML <video> element with
// srcObject set to a MediaStream wrapping the displayed track.

import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

type Props = {
  track: MediaStreamTrack | null;
};

export const VideoPreview = ({ track }: Props) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const previewStream = useMemo(() => (track ? new MediaStream([track]) : null), [track]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = previewStream;
  }, [previewStream]);

  return (
    <View style={styles.box}>
      {/* react-native-web maps the `video` element through; muted + playsInline
          required for autoplay on most browsers without user gesture. */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    aspectRatio: 4 / 3,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    overflow: 'hidden',
  },
});

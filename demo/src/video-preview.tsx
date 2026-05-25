// Native video preview. Wraps the displayed track in a MediaStream and
// renders via RTCView from react-native-webrtc. Metro resolves the .web.tsx
// sibling for the web target.

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  MediaStream,
  type MediaStreamTrack as RNWebRTCMediaStreamTrack,
  RTCView,
} from 'react-native-webrtc';

type Props = {
  track: MediaStreamTrack | null;
};

export const VideoPreview = ({ track }: Props) => {
  const streamUrl = useMemo(() => {
    if (!track) return null;
    // Cast back to rn-webrtc's MediaStreamTrack: the demo carries DOM-typed
    // tracks across the cross-platform boundary, but on native they ARE
    // rn-webrtc instances and MediaStream's constructor expects that shape.
    const ms = new MediaStream([track as unknown as RNWebRTCMediaStreamTrack]);
    return ms.toURL();
  }, [track]);

  if (!streamUrl) {
    return <View style={styles.box} />;
  }

  // contain, not cover: on a portrait phone the composited frame is TALL, and
  // cover-displaying a tall frame in this wider box scales it up until the width
  // fills, cropping top and bottom. contain shows the whole frame (only the
  // sides are clipped, by the background's own cover-fit) at the cost of
  // letterbox bars beside a portrait frame.
  return <RTCView streamURL={streamUrl} objectFit="contain" style={styles.box} />;
};

const styles = StyleSheet.create({
  box: {
    aspectRatio: 4 / 3,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
  },
});

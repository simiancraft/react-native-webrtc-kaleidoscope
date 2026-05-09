// Native video preview placeholder. The real RTCView wiring lands in Commit 9.

import { StyleSheet, Text, View } from 'react-native';

type Props = {
  track: MediaStreamTrack | null;
};

export const VideoPreview = ({ track: _track }: Props) => (
  <View style={styles.box}>
    <Text style={styles.text}>Native preview not implemented yet (Commit 9)</Text>
  </View>
);

const styles = StyleSheet.create({
  box: {
    aspectRatio: 4 / 3,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  text: { color: '#666', textAlign: 'center', padding: 12 },
});

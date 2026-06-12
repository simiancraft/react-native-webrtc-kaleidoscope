// Native footer. Project + author links as text (no SVG renderer in the
// demo's native footprint) plus the canonical Simiancraft credit. Metro
// resolves the .web.tsx sibling for the web target.

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

const LINKS = [
  { label: 'GitHub', url: 'https://github.com/simiancraft/react-native-webrtc-kaleidoscope' },
  { label: 'X', url: 'https://x.com/5imian' },
  { label: 'Ko-fi', url: 'https://ko-fi.com/the_simian0604' },
];

export const Footer = () => (
  <View style={styles.footer}>
    <View style={styles.links}>
      {LINKS.map(({ label, url }) => (
        <Pressable key={label} onPress={() => Linking.openURL(url)}>
          <Text style={styles.link}>{label}</Text>
        </Pressable>
      ))}
    </View>
    <Pressable onPress={() => Linking.openURL('https://simiancraft.com')}>
      <Text style={styles.crafted}>
        Crafted with care by <Text style={styles.craftedLink}>Simiancraft</Text>
      </Text>
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  footer: { alignItems: 'center', gap: 12, marginTop: 32, paddingBottom: 16 },
  links: { flexDirection: 'row', gap: 20 },
  link: { color: '#888', fontSize: 12, textDecorationLine: 'underline' },
  crafted: { color: '#5a5a5a', fontSize: 11 },
  craftedLink: { color: '#888', textDecorationLine: 'underline' },
});

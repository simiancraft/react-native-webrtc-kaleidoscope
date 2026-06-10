// Renders children only after the first client mount. During Expo Router's
// static server render (web.output: 'static') the children are skipped, so a
// component that calls useLayoutEffect on the server (e.g. the web shim for
// @react-native-community/slider) never enters the static tree and the SSR
// "useLayoutEffect does nothing on the server" warning is avoided. `fallback`
// holds the same footprint until hydration so there's no layout shift.

import { type ReactNode, useEffect, useState } from 'react';

type Props = { children: ReactNode; fallback?: ReactNode };

export function ClientOnly({ children, fallback = null }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}

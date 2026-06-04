// ESLint exists here for ONE purpose: the `react-compiler/react-compiler` rule,
// run against the library's own React components. Biome owns all general
// lint+format (see biome.json); this config does not duplicate any of that.
//
// Why: the library ships SOURCE (Metro resolves the `react-native` condition to
// src/), so a consumer with React Compiler enabled compiles these components in
// their own graph. This rule flags any component that violates the Rules of React,
// so such a consumer gets a correct, optimizable result instead of a per-component
// bail-out. (The library ships unmemoized source: no hand-rolled `useMemo`/
// `useCallback`; consumers run React Compiler over it, so this gate verifies
// every component is compiler-safe and gets optimized in the consumer's graph.)
//
// The demo is intentionally out of scope (it is the consumer, not the library).

import tsParser from '@typescript-eslint/parser';
import reactCompiler from 'eslint-plugin-react-compiler';

export default [
  {
    files: ['src/components/**/*.{ts,tsx}', 'catalog/composites/**/*.controls.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-compiler': reactCompiler },
    rules: {
      // Report EVERY component the compiler would BAIL OUT of (skip), not just
      // hard Rules-of-React errors. We compile the whole library with React
      // Compiler, so a skipped component ships unoptimized; that must fail the
      // gate. Non-deterministic gestures (try/catch, etc.) cause skips; this
      // makes the linter catch them so every component stays compilable.
      'react-compiler/react-compiler': ['error', { __unstable_donotuse_reportAllBailouts: true }],
    },
  },
];

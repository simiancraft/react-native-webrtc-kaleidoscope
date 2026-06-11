// Cross-file invariant guard for the /livekit subpath's mask surface (#47).
//
// Read-as-text on purpose (the registry-parity pattern): importing
// src/livekit.ts under bun would load the whole browser pipeline graph
// (Insertable Streams, WebGL compositor, segmenter), which bun can load but
// never execute, so it would only pollute coverage with dead weight. The
// behavior (write-through and clamps) is unit-tested where it lives,
// web-driver/test/tuning.test.ts; the end-to-end consumer path (built dist in
// Chromium, live masked pipeline) is the integration ladder's web pass. What
// remains to pin here is the wiring: the subpath must re-export the mask
// surface, and from the right module.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const livekitSource = readFileSync(new URL('../src/livekit.ts', import.meta.url), 'utf8');

describe('livekit subpath mask surface (wiring)', () => {
  test('re-exports setMaskTuning from the web tuning module', () => {
    expect(livekitSource).toMatch(
      /export\s*\{\s*setMaskTuning\s*\}\s*from\s*'\.\.\/web-driver\/tuning'/,
    );
  });

  test('re-exports the MaskInput type', () => {
    expect(livekitSource).toMatch(
      /export\s+type\s*\{\s*MaskInput\s*\}\s*from\s*'\.\/kaleidoscope\/types'/,
    );
  });
});

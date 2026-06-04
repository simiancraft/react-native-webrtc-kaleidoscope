#!/usr/bin/env bun
// Kotlin format + lint gate via ktlint, standalone (no Android SDK needed, just
// a JVM). The Android module's gradle build needs the SDK (`check:android`), but
// ktlint runs on the `.kt` source directly, so this works in CI and locally where
// gradle-android cannot. Default: check (fail on issues). `--format` / `-F`:
// apply fixes. The ktlint binary is fetched once into `.tooling/` (gitignored),
// mirroring the shader toolchain pattern.

import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';

const ROOT = path.resolve(import.meta.dir, '..');
const KTLINT = path.join(ROOT, '.tooling', 'ktlint');
const KTLINT_VERSION = '1.5.0';
const GLOB = 'android/src/**/*.kt';

// ktlint runs on a JVM; force JDK 17 when the documented path exists (WSL's
// default OpenJDK is 8, which ktlint's bytecode rejects), else trust PATH.
const JDK17 = '/usr/lib/jvm/java-17-openjdk-amd64';
const javaBin = existsSync(JDK17) ? `${JDK17}/bin` : '';
const env = { ...process.env, PATH: javaBin ? `${javaBin}:${process.env.PATH}` : process.env.PATH };

if (!existsSync(KTLINT)) {
  console.log(`[ktlint] fetching ktlint ${KTLINT_VERSION} into .tooling/ ...`);
  await $`mkdir -p ${path.dirname(KTLINT)}`;
  await $`curl -fsSL -o ${KTLINT} https://github.com/pinterest/ktlint/releases/download/${KTLINT_VERSION}/ktlint`;
  chmodSync(KTLINT, 0o755);
}

const format = process.argv.includes('--format') || process.argv.includes('-F');
const args = format ? ['-F', GLOB] : [GLOB];
const proc = Bun.spawnSync([KTLINT, ...args], {
  cwd: ROOT,
  env,
  stdio: ['inherit', 'inherit', 'inherit'],
});
process.exit(proc.exitCode ?? 0);

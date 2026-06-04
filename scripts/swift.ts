#!/usr/bin/env bun
// Swift format + lint gate via SwiftFormat + SwiftLint, standalone (no Xcode or
// iOS SDK needed; the prebuilt Linux binaries lint the `.swift` source directly).
// The iOS app BUILD needs Xcode (done on the iOS machine / EAS); these run in CI
// and on this Linux box where xcodebuild cannot. Default: check (fail on issues).
// `--format` / `-F`: apply fixes. Binaries are fetched once into `.tooling/`
// (gitignored), mirroring scripts/ktlint.ts.
//
// SwiftLint ships two Linux binaries: `swiftlint` (dynamically linked, needs a
// newer glibc than Debian 12 has) and `swiftlint-static` (portable). Use the
// static one. SourceKit-dependent rules are auto-skipped without a toolchain;
// that is fine, the config relies on the syntactic rules.

import { chmodSync, existsSync } from 'node:fs';
import path from 'node:path';
import { $ } from 'bun';

const ROOT = path.resolve(import.meta.dir, '..');
const TOOLING = path.join(ROOT, '.tooling');
const SWIFTFORMAT = path.join(TOOLING, 'swiftformat_linux');
const SWIFTLINT = path.join(TOOLING, 'swiftlint-static');
const SWIFTFORMAT_VERSION = '0.61.1';
const SWIFTLINT_VERSION = '0.63.3';
const TARGET = 'ios';

async function ensure(binary: string, label: string, url: string): Promise<void> {
  if (existsSync(binary)) return;
  console.log(`[swift] fetching ${label} into .tooling/ ...`);
  const zip = `${binary}.zip`;
  await $`mkdir -p ${TOOLING}`;
  await $`curl -fsSL -o ${zip} ${url}`;
  await $`unzip -o -q ${zip} -d ${TOOLING}`;
  chmodSync(binary, 0o755);
}

await ensure(
  SWIFTFORMAT,
  `SwiftFormat ${SWIFTFORMAT_VERSION}`,
  `https://github.com/nicklockwood/SwiftFormat/releases/download/${SWIFTFORMAT_VERSION}/swiftformat_linux.zip`,
);
await ensure(
  SWIFTLINT,
  `SwiftLint ${SWIFTLINT_VERSION}`,
  `https://github.com/realm/SwiftLint/releases/download/${SWIFTLINT_VERSION}/swiftlint_linux_amd64.zip`,
);

const format = process.argv.includes('--format') || process.argv.includes('-F');
const run = (cmd: string[]): number => {
  const proc = Bun.spawnSync(cmd, { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'] });
  return proc.exitCode ?? 0;
};

if (format) {
  run([SWIFTFORMAT, TARGET]);
  run([SWIFTLINT, '--fix', TARGET]);
}

// Gate: format must be a no-op and lint must be clean (--strict fails on warnings).
let failed = false;
failed = run([SWIFTFORMAT, '--lint', TARGET]) !== 0 || failed;
failed = run([SWIFTLINT, 'lint', '--strict', TARGET]) !== 0 || failed;
process.exit(failed ? 1 : 0);

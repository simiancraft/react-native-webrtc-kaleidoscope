# Contributing to react-native-webrtc-kaleidoscope

Thanks for considering a contribution. This is a native Expo Module wrapping `react-native-webrtc`'s undocumented `_setVideoEffects` API; the bar for merging is high, but the review is friendly.

## Prerequisites

- [Bun](https://bun.sh) 1.3+ (package manager + test runner)
- Node.js 20+ (only required for `semantic-release` in CI; Bun runs the TypeScript sources directly during development)
- For native development:
  - **iOS:** Xcode 15+, CocoaPods, an iOS 15+ device or simulator
  - **Android:** Android Studio, JDK 17, an API-31+ emulator or device
- For the in-repo `demo/`: an Expo-compatible camera (real device strongly recommended; simulators have limited camera support)

## Setup

```sh
git clone https://github.com/simiancraft/react-native-webrtc-kaleidoscope.git
cd react-native-webrtc-kaleidoscope
bun install
```

## Common tasks

| Task | Command |
|---|---|
| Run all tests | `bun test` |
| Typecheck | `bun run typecheck` |
| Lint | `bun run lint` |
| Auto-fix lint | `bun run lint:fix` |
| Format | `bun run format` |
| Build the library + config plugin | `bun run build` |
| Start the demo (Metro) | `bun run demo` |
| Run demo on iOS | `bun run demo:ios` |
| Run demo on Android | `bun run demo:android` |
| Run demo on web | `bun run demo:web` |
| Validate npm packaging | `bun run check:package` |
| Find unused exports | `bun run check:knip` |

## Native module gotchas

- The undocumented `track._setVideoEffects(['name'])` API is the entire point of this package. Before changing the JS facade, verify the upstream contract on the installed `react-native-webrtc` version (`node_modules/react-native-webrtc/src/MediaStreamTrack.ts`).
- Native frame processors are **registered once at app boot**, not per-call. The config plugin injects this registration into `MainApplication.onCreate()` (Android) and `application:didFinishLaunchingWithOptions:` (iOS). Avoid moving registration into a runtime-callable path.
- Web uses `MediaStreamTrackProcessor` + `MediaStreamTrackGenerator` (Insertable Streams). Same JS interface, different implementation; Metro's `.web.ts` resolution swaps in `src/index.web.ts`.

## Commit style

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). `semantic-release` reads the commit log on every push to `main` and cuts patch/minor/major releases automatically; the commit type matters:

- `fix: ...` → patch release
- `feat: ...` → minor release
- `feat!: ...` or `BREAKING CHANGE:` footer → major release
- `chore: ...`, `docs: ...`, `test: ...`, `refactor: ...`, `ci: ...` → no release

Scopes are optional but helpful (e.g. `fix(android): ...`, `feat(blur): ...`, `feat(web): ...`).

## Pull requests

- Open a PR against `main`. CI must be green before review.
- Keep the diff focused. One logical change per PR.
- Add or update tests for any behavior change. Coverage is tracked; reductions are scrutinized.
- Update the README or JSDoc if you change a public API surface.
- Merge strategy: merge-commits (preserves individual commit semantics for semantic-release).

## Reporting issues

- Bugs: [open an issue](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/new/choose).
- Security: see [SECURITY.md](./SECURITY.md). **Do not** file public issues for vulnerabilities; use GitHub Security Advisories or email info@simiancraft.com.

## Code of conduct

This project follows the [Contributor Covenant 2.1](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

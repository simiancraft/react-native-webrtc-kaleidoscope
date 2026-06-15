<p align="center">
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/">
    <img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/evidence/issue-verification/evidence/2026-06-14-readme-demo/showcase.gif" alt="One person held in frame by the live segmentation mask while the background cycles through a parametric blur, painted worlds, and animated generative shaders" width="720" />
  </a>
</p>

<p align="center">
  <sub><b>This is the real camera, not a still pasted over a video.</b> The live segmentation mask holds one person while shipped presets swap in behind. Every icon below is a live preset, in the order the loop plays them; click one to run it on your own camera.</sub>
</p>

<p align="center">
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=blur-medium" title="Blur">🌫️</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=kaleidoscope-mandala" title="Kaleidoscope mandala">🔮</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=wizard-tower" title="Wizard's tower">🧙</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=outrun-classic" title="Outrun grid">🌆</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=observation-deck" title="Observation deck">🛸</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=data-mesh-cobalt" title="Cobalt data-mesh">🔷</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=fairy-grotto" title="Fairy grotto">🧚</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=simianlights-hearth" title="Simianlights hearth">🪔</a> &nbsp;
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=simiancraft-dark" title="Simiancraft">🐒</a>
  &nbsp; <sub><a href="#presets">+ dozens more</a></sub>
</p>

<p align="center">
  <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/">
    <img src="https://img.shields.io/badge/▶%20Live%20demo-blur%20yourself%2C%20swap%20the%20room-8b5cf6?style=for-the-badge" alt="Live demo" />
  </a>
</p>

<h1>
  <img src="./docs/kaleidoscope-logo-thumb.webp" alt="kaleidoscope logo" width="36" />&nbsp; react-native-webrtc-kaleidoscope
</h1>

[![npm version](https://img.shields.io/npm/v/react-native-webrtc-kaleidoscope?color=cb3837&logo=npm)](https://www.npmjs.com/package/react-native-webrtc-kaleidoscope)
[![Types: included](https://img.shields.io/npm/types/react-native-webrtc-kaleidoscope?color=3178c6&logo=typescript)](https://www.npmjs.com/package/react-native-webrtc-kaleidoscope)
[![CI](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/actions/workflows/ci.yml/badge.svg)](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/simiancraft/react-native-webrtc-kaleidoscope/graph/badge.svg)](https://codecov.io/gh/simiancraft/react-native-webrtc-kaleidoscope)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/simiancraft/react-native-webrtc-kaleidoscope/badge)](https://securityscorecards.dev/viewer/?uri=github.com/simiancraft/react-native-webrtc-kaleidoscope)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Blur yourself, swap the room; live, on the device.** Real-time background blur and replacement for React Native and web video calls: bundled images, animated generative shaders, or painted worlds, each stenciled to the person by an on-device segmentation mask. Works with `react-native-webrtc` and LiveKit on Android, iOS, and Chromium browsers; managed-Expo-friendly.

Every other turnkey option we could find is a feature welded to one vendor's calling SDK (Stream, Agora, 100ms, and the rest). This one attaches to `react-native-webrtc` instead, so it rides whatever stack you already run, LiveKit included. And where those vendors ship blur and a static image, this paints animated, generative-shader backgrounds and whole worlds.

What you get:

- **Four simple functions.** `bindKaleidoscope(track, { presets })` hands back [`kaleidoscope`, `transform`, `mask`, and `dispose`](#the-four-verbs); that is the whole runtime API.
- **Agent-first setup.** Point a coding agent at [`llms.txt`](./llms.txt) and it [installs the package, writes the config plugin, and gets an effect on screen](#with-an-agent) without you babysitting it.
- **Turnkey implementation.** [Drop-in components](#quick-start), a picker, a live editor, and a persistence provider, render [63 presets](#presets) over your camera; wire a callback, ship it.
- **Cost and tooling.** Every shader carries a [measured GPU cost](#performance) you can read before you ship, and the [bench, meter, and thumbnail tools](#authoring-tooling) come in the box.
- **Won't bloat your binary.** Per-asset subpath exports and `sideEffects: false` mean you [ship only the presets you reference](#only-ship-what-you-use); web tree-shakes and native bundles just the assets your book names.
- **Built for extension.** A new shader is one folder that codegens to every platform, [clear by construction](#architecture); remix the compositor to [build your own worlds](#make-your-own-presets).

## Presets

The demo book ships the gallery below; **every tile is a live link**, so click one and it opens on your own camera. Bring your own with a few lines (see [Make your own presets](#make-your-own-presets)).

<!-- PRESET-WAFFLE:START -->

<table cellspacing="0" cellpadding="2">
  <tr><td align="right" valign="middle"><sub><b>Blur</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=blur-low" title="Low"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/blur-low.thumb.webp" alt="Low" title="Low" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=blur-medium" title="Medium"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/blur-medium.thumb.webp" alt="Medium" title="Medium" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=blur-high" title="High"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/blur-high.thumb.webp" alt="High" title="High" width="58" /></a></td><td align="right" valign="middle"><sub><b>Debug</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=debug-resolutions" title="Resolutions"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/debug-resolutions.thumb.webp" alt="Resolutions" title="Resolutions" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Wizard Tower</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=wizard-tower" title="Wizard Tower"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/wizard-tower/wizard-tower.thumb.webp" alt="Wizard Tower" title="Wizard Tower" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=wizard-tower-night" title="Night"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/wizard-tower-night/wizard-tower-night.thumb.webp" alt="Night" title="Night" width="58" /></a></td><td align="right" valign="middle"><sub><b>Sky</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=clouds" title="Daytime"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/clouds/clouds.thumb.webp" alt="Daytime" title="Daytime" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=clouds-dawn" title="Dawn"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/clouds-dawn.thumb.webp" alt="Dawn" title="Dawn" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=clouds-dusk" title="Dusk"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/clouds-dusk.thumb.webp" alt="Dusk" title="Dusk" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=clouds-night" title="Night"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/clouds-night.thumb.webp" alt="Night" title="Night" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=clouds-otherworld" title="Otherworld"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/clouds-otherworld.thumb.webp" alt="Otherworld" title="Otherworld" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Spaceship</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=observation-deck" title="Observation Deck"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/observation-deck/observation-deck.thumb.webp" alt="Observation Deck" title="Observation Deck" width="58" /></a></td><td align="right" valign="middle"><sub><b>Plasma</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=plasma-ocean" title="Ocean"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/plasma-ocean.thumb.webp" alt="Ocean" title="Ocean" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=plasma-sunset" title="Sunset"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/plasma-sunset.thumb.webp" alt="Sunset" title="Sunset" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=plasma-mint" title="Mint"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/plasma-mint.thumb.webp" alt="Mint" title="Mint" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=plasma-fast" title="Fast"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/plasma-fast.thumb.webp" alt="Fast" title="Fast" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Fairy Cave</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=fairy-cave" title="Fairy Cave"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/fairy-cave/fairy-cave.thumb.webp" alt="Fairy Cave" title="Fairy Cave" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=fairy-grotto" title="Grotto"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/fairy-grotto/fairy-grotto.thumb.webp" alt="Grotto" title="Grotto" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=fairy-hollow" title="Hollow"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/fairy-hollow/fairy-hollow.thumb.webp" alt="Hollow" title="Hollow" width="58" /></a></td><td align="right" valign="middle"><sub><b>Kaleidoscope</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=kaleidoscope-stained-glass" title="Stained Glass"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/kaleidoscope-stained-glass.thumb.webp" alt="Stained Glass" title="Stained Glass" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=kaleidoscope-mandala" title="Mandala"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/kaleidoscope-mandala.thumb.webp" alt="Mandala" title="Mandala" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=kaleidoscope-prism" title="Prism"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/kaleidoscope-prism.thumb.webp" alt="Prism" title="Prism" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Ocean</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=underwater" title="Underwater"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/underwater/underwater.thumb.webp" alt="Underwater" title="Underwater" width="58" /></a></td><td align="right" valign="middle"><sub><b>Neo-Memphis</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=neo-memphis-jazz-cup" title="Jazz Cup"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/neo-memphis-jazz-cup.thumb.webp" alt="Jazz Cup" title="Jazz Cup" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=neo-memphis-bauhaus" title="Bauhaus"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/neo-memphis-bauhaus.thumb.webp" alt="Bauhaus" title="Bauhaus" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=neo-memphis-confetti" title="Confetti"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/neo-memphis-confetti.thumb.webp" alt="Confetti" title="Confetti" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Corporate</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=corporate-blobs" title="Blobs"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/corporate-blobs/corporate-blobs.thumb.webp" alt="Blobs" title="Blobs" width="58" /></a></td><td align="right" valign="middle"><sub><b>Halftone</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=halftone-boardroom" title="Boardroom"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/halftone-boardroom.thumb.webp" alt="Boardroom" title="Boardroom" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=halftone-press" title="Press"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/halftone-press.thumb.webp" alt="Press" title="Press" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=halftone-ripple" title="Ripple"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/halftone-ripple.thumb.webp" alt="Ripple" title="Ripple" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Simiancraft</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=simiancraft-light" title="Simiancraft Light"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/simiancraft-light.thumb.webp" alt="Simiancraft Light" title="Simiancraft Light" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=simiancraft-dark" title="Simiancraft Dark"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/simiancraft-dark.thumb.webp" alt="Simiancraft Dark" title="Simiancraft Dark" width="58" /></a></td><td align="right" valign="middle"><sub><b>Aurora</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=aurora-corporate-silk" title="Corporate Silk"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/aurora-corporate-silk.thumb.webp" alt="Corporate Silk" title="Corporate Silk" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=aurora-dusk" title="Dusk"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/aurora-dusk.thumb.webp" alt="Dusk" title="Dusk" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=aurora-polar" title="Polar"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/aurora-polar.thumb.webp" alt="Polar" title="Polar" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Office</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=office-dark" title="Dark Office"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/office-dark.thumb.webp" alt="Dark Office" title="Dark Office" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=office-light" title="Light Office"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/office-light.thumb.webp" alt="Light Office" title="Light Office" width="58" /></a></td><td align="right" valign="middle"><sub><b>Outrun</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=outrun-classic" title="Classic"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/outrun-classic.thumb.webp" alt="Classic" title="Classic" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=outrun-miami" title="Miami"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/outrun-miami.thumb.webp" alt="Miami" title="Miami" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=outrun-circuit" title="Circuit"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/outrun-circuit.thumb.webp" alt="Circuit" title="Circuit" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=outrun-acid" title="Acid"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/outrun-acid.thumb.webp" alt="Acid" title="Acid" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=outrun-vapor" title="Vapor"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/outrun-vapor.thumb.webp" alt="Vapor" title="Vapor" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Nature</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=landscape-light" title="Nature Light"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/landscape-light.thumb.webp" alt="Nature Light" title="Nature Light" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=landscape-dark" title="Nature Dark"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/landscape-dark.thumb.webp" alt="Nature Dark" title="Nature Dark" width="58" /></a></td><td align="right" valign="middle"><sub><b>Nebula</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=nebula" title="Nebula"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/nebula/nebula.thumb.webp" alt="Nebula" title="Nebula" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=nebula-ember" title="Ember"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/nebula-ember.thumb.webp" alt="Ember" title="Ember" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=nebula-drift" title="Drift"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/nebula-drift.thumb.webp" alt="Drift" title="Drift" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Home</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=home-light" title="Home Light"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/home-light.thumb.webp" alt="Home Light" title="Home Light" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=home-dark" title="Home Dark"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/home-dark.thumb.webp" alt="Home Dark" title="Home Dark" width="58" /></a></td><td align="right" valign="middle"><sub><b>Simianlights</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=simianlights" title="Simianlights"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/catalog/composites/simianlights/simianlights.thumb.webp" alt="Simianlights" title="Simianlights" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=simianlights-glacier" title="Glacier"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/simianlights-glacier.thumb.webp" alt="Glacier" title="Glacier" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=simianlights-hearth" title="Hearth"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/simianlights-hearth.thumb.webp" alt="Hearth" title="Hearth" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Sci-Fi</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=sci-fi-light" title="Landscape"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/sci-fi-light.thumb.webp" alt="Landscape" title="Landscape" width="58" /></a></td><td align="right" valign="middle"><sub><b>Interior</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=interior-home" title="Home"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/interior-home.thumb.webp" alt="Home" title="Home" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=interior-office" title="Office"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/interior-office.thumb.webp" alt="Office" title="Office" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=interior-ab-shaft" title="A/B 1-shaft"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/interior-ab-shaft.thumb.webp" alt="A/B 1-shaft" title="A/B 1-shaft" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=interior-ab-3beam" title="A/B 3-beam"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/interior-ab-3beam.thumb.webp" alt="A/B 3-beam" title="A/B 3-beam" width="58" /></a></td></tr>
  <tr><td align="right" valign="middle"><sub><b>Oceanscape</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=oceanscape-dark" title="Underwater"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/oceanscape-dark.thumb.webp" alt="Underwater" title="Underwater" width="58" /></a></td><td align="right" valign="middle"><sub><b>Data-Mesh</b></sub></td><td valign="middle"><a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=data-mesh-datafield" title="Datafield"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/data-mesh-datafield.thumb.webp" alt="Datafield" title="Datafield" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=data-mesh-boardroom" title="Boardroom"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/data-mesh-boardroom.thumb.webp" alt="Boardroom" title="Boardroom" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=data-mesh-acid" title="Acid"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/data-mesh-acid.thumb.webp" alt="Acid" title="Acid" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=data-mesh-cobalt" title="Cobalt"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/data-mesh-cobalt.thumb.webp" alt="Cobalt" title="Cobalt" width="58" /></a> <a href="https://simiancraft.github.io/react-native-webrtc-kaleidoscope/?preset=data-mesh-slate" title="Slate"><img src="https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/demo/assets/thumbnails/data-mesh-slate.thumb.webp" alt="Slate" title="Slate" width="58" /></a></td></tr>
</table>

<sub>63 presets across 4 families (Effects, Worlds, Backgrounds, Shaders); click any to open it live, or <a href="#make-your-own-presets">make your own</a> in a few lines.</sub>

<!-- PRESET-WAFFLE:END -->

<sub>Runs on Android, iOS, and Chromium browsers (Chrome, Edge), against either `react-native-webrtc` or LiveKit. Platform specifics and the Safari/Firefox fallback are in [Platform support](#platform-support).</sub>

## Quick start

Two paths to a working integration: hand it to a coding agent, or wire it yourself. Either way the shape is the same: install, add the config plugin, declare a preset book, bind a track.

### With an agent

Point your coding agent (Claude Code, Cursor, Copilot, …) at [`llms.txt`](./llms.txt). It is written for exactly this: a top-to-bottom integration guide that installs the package, writes the config-plugin entry, provisions a runnable preset book, and gets an effect on screen, with a six-file starting set lifted from the working `demo/`.

```
Read https://raw.githubusercontent.com/simiancraft/react-native-webrtc-kaleidoscope/main/llms.txt
and integrate react-native-webrtc-kaleidoscope into this Expo app: add the config
plugin, create a starter preset book, and show the PresetBookMenu over my camera track.
```

### Manually

```sh
bun add react-native-webrtc react-native-webrtc-kaleidoscope
```

`react-native-webrtc` is a peer dependency; install it explicitly. (Using LiveKit instead? See [Using LiveKit](#using-livekit).) Add the config plugin to `app.config.ts`, then rebuild native code:

```ts
export default { expo: { plugins: ['react-native-webrtc-kaleidoscope'] } };
```

```sh
bunx expo prebuild
```

Declare a **preset book**: a flat catalog of the effects you can command. A rudimentary one is three entries:

```ts
// kaleidoscope.preset-book.ts
import type { KaleidoscopePresetBook } from 'react-native-webrtc-kaleidoscope';
import { officeDark } from 'react-native-webrtc-kaleidoscope/images/office/office-dark';
import { wizardTower } from 'react-native-webrtc-kaleidoscope/composites/wizard-tower';

export const presets = {
  'blur-soft': {
    name: 'Soft blur',
    taxonomy: ['Effects', 'Blur'],
    layers: [
      { id: 'bg', shader: 'blur', target: 'background', uniforms: { sigma: 5 } },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  'office-dark': {
    name: 'Dark office',
    taxonomy: ['Backgrounds', 'Office'],
    thumbnail: officeDark,
    layers: [
      { id: 'office', shader: 'image', source: officeDark },
      { id: 'you', shader: 'direct', target: 'subject' },
    ],
  },
  // A packaged multi-layer world, imported and spread in.
  'wizard-tower': wizardTower,
} as const satisfies KaleidoscopePresetBook;
```

Bind a track once and drive it:

```ts
import { mediaDevices } from 'react-native-webrtc';
import { bindKaleidoscope } from 'react-native-webrtc-kaleidoscope';
import { presets } from './kaleidoscope.preset-book';

const stream = await mediaDevices.getUserMedia({ video: true });
const [track] = stream.getVideoTracks();

const { kaleidoscope, dispose } = bindKaleidoscope(track, {
  presets,
  // Web yields a NEW track per command; read it here. Native mutates in place.
  onTrack: (out) => {/* setPreviewTrack(out) */},
});

kaleidoscope('wizard-tower'); // autocompletes from your book
// call dispose() on unmount to release the track
```

<sub>Strict TypeScript setups that pull in the DOM lib may need `track as unknown as MediaStreamTrack` here; `react-native-webrtc`'s track type is structurally narrower than the DOM one, the same cast the demo uses.</sub>

For a ready-made gallery, drop in the picker; it reads your book directly:

```tsx
import { PresetBookMenu } from 'react-native-webrtc-kaleidoscope/preset-book-menu';
import { presets } from './kaleidoscope.preset-book';

<PresetBookMenu presets={presets} value={art} onSelect={setArt} />;
// route onSelect into kaleidoscope() and the picker is wired.
```

Want the selection, live tweaks, and mask edge to survive a reload? Wrap your app in the [persistence provider](#persistence). Want the styled UI and a live tuning panel? See [Drop-in UI](#drop-in-ui).

### Using LiveKit

If your project uses `@livekit/react-native` it pulls in `@livekit/react-native-webrtc`, a fork that preserves the same `videoEffects` native classes and `_setVideoEffects` JS API. Kaleidoscope works against either fork; the Android Gradle script picks whichever one autolinking surfaced. Pick **one** fork, never both, or the native classes collide.

```sh
bun add @livekit/react-native @livekit/react-native-webrtc react-native-webrtc-kaleidoscope
```

On native, `@livekit/react-native` hands you a `LocalVideoTrack`; bind to its underlying `MediaStreamTrack`:

```ts
const { kaleidoscope } = bindKaleidoscope(localCameraTrack.mediaStreamTrack, { presets });
kaleidoscope('blur-soft');
```

On web, LiveKit owns the `RTCRtpSender`, so you cannot swap the track yourself; go through LiveKit's processor API. The opt-in `/livekit` subpath ships a ready-made processor (it needs `livekit-client`, which a LiveKit app already has):

```ts
import { KaleidoscopeProcessor, setMaskTuning } from 'react-native-webrtc-kaleidoscope/livekit';

// A processor effect is a `composite` spec: the same layer stack a preset projects into.
await localVideoTrack.setProcessor(
  new KaleidoscopeProcessor([
    {
      name: 'composite',
      layers: [
        { id: 'bg', shader: 'blur', uniforms: { sigma: 8 } },
        { id: 'you', shader: 'direct', target: 'subject' },
      ],
    },
  ]),
  true,
);
setMaskTuning({ hardness: 0.2, threshold: 0.85 }); // the processor-path twin of `mask`
```

The processor takes the same effect inputs as the core API: a `composite` spec (its layer stack), or a bare transform name like `'flip-x'`; not a preset-book id. The `true` shows the processed stream in your local preview. It tears down its Insertable-Streams pipeline on camera flip (`restart`) and unpublish (`destroy`), so repeated flips do not leak generators.

## Concepts

The vocabulary, in the order you meet it.

| Term | What it is |
|---|---|
| **Preset book** | The file you author (`kaleidoscope.preset-book.ts`): a flat, typed map of the effects your app can command. Your point of entry; everything hangs off it. Declare `as const satisfies KaleidoscopePresetBook` for per-layer typing and id autocomplete. |
| **Preset** | One named entry in the book: `{ name, taxonomy, thumbnail?, layers, controls? }`. What `kaleidoscope(id)` applies. `taxonomy` is the picker's grouping path (`[group, category]`). |
| **Layer** | One entry in a preset's stack, painted back to front, addressed by a unique `id`. Three fields shape it:<br>&bull; **shader**: what it draws (`image`, `direct` the camera, `blur`, or a generative shader like `plasma` or `clouds`).<br>&bull; **target**: where it lands, `background` (fullscreen) or `subject` (stenciled to the person).<br>&bull; **blend**: how it stacks, opaque, `normal` (alpha-over), or `additive`. |
| **Composite** | What a preset becomes at runtime: the layer stack rendered into the frame. One registered native effect; "one effect" is a composite with a single layer. |
| **Patch** | A partial uniform override addressed by a layer `id`, merged over the baked values live with no rebuild. The lever the live editor and persistence ride on. |
| **Controls** | The editor component a preset supplies (`controls?`) so its tunable uniforms get sliders in the live panel. |

`direct` + `subject` is the masked person; `direct` + `background` is the raw camera frame.

## The four verbs

<p align="center">
  <code>kaleidoscope</code> &nbsp;•&nbsp; <code>transform</code> &nbsp;•&nbsp; <code>mask</code> &nbsp;•&nbsp; <code>dispose</code>
</p>

`bindKaleidoscope(track, { presets })` returns four functions (plus the live `track`). That is the whole runtime API.

| Verb | What it does |
|---|---|
| **`kaleidoscope(id, patches?)`** | Swap the background. Pass a preset id; optionally patch a layer's uniforms live, addressed by `id`. Pass `null` to clear. |
| **`transform(state?)`** | Absolute flip and rotate, snapped to 90°. Every call is the full state from identity; call bare to reset. |
| **`mask(edge)`** | Tune the one segmentation edge shared by every effect: `hardness` and `threshold`, both `0..1`. |
| **`dispose()`** | Tear down the pipeline and release the bound track. Call on unmount. |

```ts
const { kaleidoscope, transform, mask, dispose } =
  bindKaleidoscope(track, { presets, onTrack });

kaleidoscope('wizard-tower');          // a preset id
kaleidoscope('blur-soft', [            // patch a layer live, by id
  { id: 'bg', uniforms: { sigma: 9 } },
]);
kaleidoscope(null);                    // clear the art

transform({ flip: { x: true }, rotate: 90 });
transform();                           // reset to identity

mask({ hardness: 0.5, threshold: 0.5 });
dispose();                             // on unmount
```

Many uniforms are normalized `0..1`; others (`sigma`, scales, counts) carry natural units, and JSDoc documents each range. `mask` defaults to `0.5 / 0.5`; nudge it to match your camera and lighting.

## Make your own presets

A preset is a composition: **every preset is a back-to-front stack of N layers**, and the compositor does not care what produces a layer's texture, which is exactly what makes it extensible. To author one, stack layers in the order you want them painted, lowest first, the masked person (`{ shader: 'direct', target: 'subject' }`) usually last so it sits on top.

```ts
// A generative shader behind the person, with an additive glow layer on top of it.
'aurora-night': {
  name: 'Aurora night',
  taxonomy: ['Shaders', 'Aurora'],
  layers: [
    { id: 'sky',  shader: 'clouds',   target: 'background', uniforms: { uCoverage: 0.4 } },
    { id: 'glow', shader: 'godrays',  target: 'background', blend: 'additive', uniforms: { uRayIntensity: 0.6 } },
    { id: 'you',  shader: 'direct',   target: 'subject' },
  ],
},
```

The demo book's [`wolf-cave`](./demo/kaleidoscope.preset-book.ts) is a runnable example of a custom composite (a bundled image plus the masked person). It is demo-owned, its image not shipped in the package, which is the point: it shows a consumer adding their own background.

- **Bundled images** ship as tree-shakeable `image` layers, filed by category and imported per image (`import { officeDark } from 'react-native-webrtc-kaleidoscope/images/office/office-dark'`). On web a `source` can also be any image URL or data URI; native resolves bundled ids only. See [`catalog/images/README.md`](./catalog/images/README.md).
- **New shaders** drop a single `.frag` + typed `.ts` into `catalog/shaders/<name>/`; `bun run build:shaders` codegens the web and Android sources and transpiles the iOS Metal. The canonical upright frame and the mask stencil come for free; you write zero orientation code. See [`catalog/shaders/README.md`](./catalog/shaders/README.md).
- **Packaged composites** (the Worlds) live in `catalog/composites/<name>/` behind a `./composites/<name>` subpath export; import and spread one into your book.

After adding a preset to the demo book, regenerate its thumbnail and this README's gallery: `bun run thumbs && bun run gen:waffle` (see [Authoring tooling](#authoring-tooling)).

## Drop-in UI

Build your own controls against the four verbs, or import the headless, controlled components. All are presentational: they emit a selection or a patch, you apply it.

### The picker

`PresetBookMenu` (from `react-native-webrtc-kaleidoscope/preset-book-menu`) is a two-level browser driven by each preset's `taxonomy`: a tab row across the top, one tab per **group** (`taxonomy[0]`), and a left-hand menu of **categories** (`taxonomy[1]`) under the active group; the tile grid filters by both. A flat (depth-1) group shows no category menu. Every preset renders as a uniform tile: a wallpaper when it has a `thumbnail`, a recessed button of the same footprint when it does not, so a thumbnail-less preset never breaks the grid. The same pieces ship as standalone primitives (`PresetGrid`, `PresetTile`, the `usePresetBookMenu` hook, `PresetBookMenuLayout`) for custom layouts.

**Styling, three tiers.** Sensible defaults out of the box; override with an RN `style` prop, a `className` prop, or a `renderTile` render-prop slot for full control.

**NativeWind-ready.** The components accept `className`. Turn it on by importing the opt-in registration once (`nativewind` is an optional peer; the core `./preset-book-menu` import never pulls it in):

```ts
import { registerKaleidoscopeNativeWind } from 'react-native-webrtc-kaleidoscope/nativewind';
registerKaleidoscopeNativeWind();
```

### Live controls (the editor)

For a tuning or admin panel, `react-native-webrtc-kaleidoscope/preset-control-panel` ships a headless editor that reads the active preset and renders a control per tunable uniform, plus the mask and transform panels:

```tsx
import {
  KaleidoscopeThemeProvider,
  PresetControlPanel,
  MaskControlPanel,
  TransformControlPanel,
} from 'react-native-webrtc-kaleidoscope/preset-control-panel';

<KaleidoscopeThemeProvider>
  <PresetControlPanel presets={presets} value={art} onPatch={(p) => controls.kaleidoscope(art, [p])} />
  <MaskControlPanel hardness={h} threshold={t} onChange={setMask} />
  <TransformControlPanel flip={flip} rotate={rotate} onChange={setTransform} />
</KaleidoscopeThemeProvider>
```

Each preset supplies its editor as a `controls` component on the book entry; packaged composites export theirs at `react-native-webrtc-kaleidoscope/composites/<name>/controls`. For your own presets, compose `CompositeLayerControlPanel` over a shader's control descriptor (or `makeControls` for a custom widget). `KaleidoscopeThemeProvider` themes every control at once. The sliders need `@react-native-community/slider` (an optional peer; a native module, so it needs a dev-client rebuild). Live per-layer tuning runs on web today; on native the editor renders while the live per-layer uniform channel is in progress. Mask and transform are live on every platform.

### Persistence

`react-native-webrtc-kaleidoscope/persistence` ships a provider + hook that keep the person's selection across launches: the last applied preset id, the per-layer uniform patches they dialed in (kept per preset), and the mask edge.

```tsx
// App root:
import { KaleidoscopeStateProvider } from 'react-native-webrtc-kaleidoscope/persistence';
<KaleidoscopeStateProvider presets={presets}><App /></KaleidoscopeStateProvider>;

// In the screen that binds the track:
import { useKaleidoscopeState } from 'react-native-webrtc-kaleidoscope/persistence';
const { hydrated, presetId, mask, setPreset, setMask, setPatch, patchesFor, reset } =
  useKaleidoscopeState<typeof presets>();

useEffect(() => {
  if (!hydrated || !controls) return; // wait: don't flash the default over the restored preset
  if (presetId) controls.kaleidoscope(presetId, patchesFor(presetId));
  else controls.kaleidoscope(null);
}, [hydrated, controls, presetId]);
```

Route the picker's `onSelect` into `setPreset`, the editor's `onPatch` into `setPatch(presetId, patch)`, and the mask panel into `setMask`; every write persists. The default store is [`@react-native-async-storage/async-storage`](https://github.com/react-native-async-storage/async-storage) (an optional peer; localStorage-backed on web). Back it with anything else (MMKV, a server) by passing a `{ load, save }` pair as the `store` prop; the stored shape is versioned and parses tolerantly, so a malformed payload reads as empty rather than throwing.

## Performance

It runs in real time on every supported platform, down to an iPhone X. Absolute frame rate is device-dependent, so the kit gives you **relative** cost instead: each shader is annotated against a cheap baseline, so you can compare effects and budget the heavy ones.

- **Annotated shader cost.** Each generative shader's `.ts` carries a measured GPU cost annotation (relative to `plasma` as the cheap baseline), so you know what a preset spends before you ship it.
- **One resolution knob.** Raw shader compute scales with output resolution, handled by the resolution tier (`targetShortSide`), not by per-effect orientation tricks. Drop the tier on weak GPUs; the mask and composite logic are unchanged.
- **Bounded work per frame.** Compositing is per-layer through a single mask stencil; a new shader inherits the pipeline's frame budget rather than adding a pass of its own.

## Authoring tooling

The kit ships the same tools used to build it. All regenerate from the command line.

| Command | What it does |
|---|---|
| `bun run bench:shader` | SPIR-V weighted op-cost bench for a shader (good for no-loop shaders; rank by the meter for loop-bound ones). |
| `bun run shader:view` | WebGL2 A/B viewer with a live GPU-time meter for tuning a shader against the camera. |
| `bun run thumbs` | Render a `320×180` WebP thumbnail per preset in a book (the gallery tiles and picker wallpapers). |
| `bun run gen:waffle` | Regenerate this README's [preset gallery](#presets) from the demo book + thumbnails. Run after adding a preset; `--check` gates staleness. |

## Only ship what you use

Install size and bundle size are different numbers, and you pay for the second.

- **Per-asset subpath exports.** Each bundled image and packaged composite is its own file behind its own subpath (`./images/<category>/<leaf>`, `./composites/<name>`), and the package sets `sideEffects: false`. A web bundler drops every preset you do not import.
- **Native ships only what your book references.** Metro does not tree-shake, so an unused preset is simply never imported; and `expo prebuild` copies only the assets your preset book actually names into the native bundle. Declare ten rooms, reference two, ship two.
- **Assets are WebP.** Backgrounds are 720p WebP; each platform decodes it natively (BitmapFactory on Android, ImageIO / MTKTextureLoader on iOS), so a full image set is a couple of megabytes, not sixteen.

## For LLMs and agents

Feeding this repo into Claude / Cursor / Copilot, or shipping it into an app with an agent? Read [`llms.txt`](./llms.txt) first: the same scope as this README in a denser, parseable shape, with a copy-paste starting fileset that runs on all three platforms. It is the file to hand an agent for a hands-off integration (see [Quick start → With an agent](#with-an-agent)).

## Architecture

Every effect is a **layer in one compositor**: a bundled `image`, a `direct` passthrough (the masked person or the raw camera), a camera-sampling `blur`, or a generative shader, composited back to front with per-layer blend. There is one registered native effect, `composite`; its layer stack is delivered out of band and reconciled each command. Adding a background source is adding a layer kind, not a new effect, which is why [a new shader](#make-your-own-presets) reaches all three platforms from one folder.

Canonical assets live in three root, folder-per-item directories, out of the TypeScript build path:

- `catalog/shaders/<name>/`: each shader's `.frag` plus its typed `.ts` (uniforms + control descriptor). All share one vertex stage; `bun run build:shaders` codegens the web and Android sources and transpiles the iOS Metal.
- `catalog/images/<category>/`: images filed by category; each is a `<leaf>.webp`, its `<leaf>.thumb.webp`, and the `<leaf>.ts` / `<leaf>.web.ts` loader pair, behind a subpath export.
- `catalog/composites/<name>/`: each packaged composite, behind a `./composites/<name>` subpath export.

The code spans the platform surfaces: `src/` (JS facade + shared types), `web-driver/` (WebGL2 pipeline), `android/` (OpenGL ES 3.0), and `ios/` (Metal). Orientation is normalized exactly once at the ingest, so effects do zero orientation work. The full contract, including the texture-orientation convention and the mask buffer-ownership rule, is in [`PATTERNS.md`](./PATTERNS.md).

## Platform support

| Platform | Transform | Blur | Background replacement | Notes |
|---|---|---|---|---|
| Web (Chrome / Edge) | ✓ | ✓ | ✓ | MediaStreamTrackProcessor + MediaPipe Selfie Segmentation (WASM, CDN) |
| Android (API 24+) | ✓ | ✓ | ✓ | OpenGL ES 3.0 + MediaPipe Selfie Segmentation (Tasks) |
| iOS (≥ 15) | ✓ | ✓ | ✓ | Metal + MediaPipe Selfie Segmentation (Tasks), verified on device. Older A11 devices (iPhone X) run at a lower frame rate |
| Safari / Firefox | n/a | n/a | n/a | No Insertable Streams; the effects throw a clear capability error and the demo falls back to the unprocessed track |

A few runtime differences worth knowing before you wire effects in:

- **Output track.** On web each `kaleidoscope` / `transform` command rebuilds the Insertable-Streams pipeline and yields a NEW `MediaStreamTrack` via `onTrack`; on native the bound track is mutated in place. `mask` updates the running composite with no rebuild on either platform.
- **Segmentation model on web.** The web compositor loads MediaPipe Selfie Segmentation from the jsDelivr CDN on first use. A strict Content-Security-Policy must allow that origin for `script-src`, `connect-src`, and the WASM fetch, and the effects do not work offline. `transform` needs no model.
- **Android revokes the camera ~60 s into the background.** Android 11+ disables camera access for backgrounded apps by device policy; `react-native-webrtc` logs it but never restarts capture, so after a long background the preview stays black on resume. Re-acquire `getUserMedia` when the app returns from the background; the demo's [`use-loopback-stream.ts`](./demo/src/use-loopback-stream.ts) shows the `AppState` pattern, and effects re-bind to the new track through the normal verbs.

## What this isn't

- **Not a fork of `react-native-webrtc`.** A thin layer over its undocumented `_setVideoEffects` registry on native, and `MediaStreamTrackProcessor` on web. Install alongside it.
- **Not a managed cloud SaaS.** Effects run locally on the device; the track stays peer-to-peer. No service, no API key, no per-minute billing.
- **Not a face-filter SDK.** Effects are background segmentation and frame transforms, not facial AR.
- **Not a streaming protocol replacement.** The transformed track plugs into your existing `RTCPeerConnection` pipeline.

## Reference

- [CHANGELOG.md](./CHANGELOG.md): release history (semantic-release, Conventional Commits).
- [CONTRIBUTING.md](./CONTRIBUTING.md): setup, scripts, commit conventions.
- [AGENTS.md](./AGENTS.md): contributor and agent orientation for working on the repo.
- [PATTERNS.md](./PATTERNS.md): codebase conventions, the orientation contract, and how to extend.
- [catalog/shaders/README.md](./catalog/shaders/README.md): adding and extending shaders.
- [catalog/images/README.md](./catalog/images/README.md): the image folder layout and formats.
- [llms.txt](./llms.txt): dense, agent-oriented integration guide.
- [SECURITY.md](./SECURITY.md): security policy and reporting.
- [NOTICE.md](./NOTICE.md): third-party attributions.

---

MIT licensed. © 2026 Jesse Harlin / [Simiancraft](https://github.com/simiancraft).

<p align="center"><sub>Crafted with care by <a href="https://simiancraft.com">Simiancraft</a>.</sub></p>

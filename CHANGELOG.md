# [1.1.0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v1.0.0...v1.1.0) (2026-05-23)


### Bug Fixes

* **backgrounds:** carry the *.webp ambient declaration in each loader ([5e777f4](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5e777f4d8000bc15e7e3b948e60ea51c52cd7f0a))
* **backgrounds:** resolve web preset URL via expo-asset ([8a014c2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/8a014c210f1d400499baceff2457424a6c487173))
* **demo:** guard effect-tuning slider handlers against missing native module ([35f0871](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/35f0871d95f913040b46adb31c8aba6509468256))
* **demo:** hide GPU passthrough preset on iOS ([5980426](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5980426ac425a40c2261db6ab9c78df27fdea00d))
* **demo:** set ios.deploymentTarget to 15.0 in expo-build-properties ([4b3cf6b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/4b3cf6bfeacf96848e8b74ecd6296aca58effb27))
* **eas:** make app config and plugin load on the EAS Node 18 worker ([08528a2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/08528a200d209511fdc95b21c15b6ecb31d24d48))
* **eas:** reference the config plugin by app.plugin.js subpath ([52e81b5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/52e81b5504d539685434135d4095ade655a07b00))
* **eas:** register the iOS Podfile mod without requiring @expo/config-plugins ([2884385](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/28843851c3f4e027e144bd036f99688e3d6b6cca))
* **facade:** platform-split _setVideoEffects clear value (iOS=[], Android=null) ([fbdc56c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/fbdc56cb79459452d5dc190e282fae6c9613c123))
* **ios:** draw fullscreen quad as 4-vertex triangle strip, not 3-vertex triangle ([5c755db](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5c755db8990544c7b3d7abd346fe0378d70395b5))
* **ios:** propagate WebRTC.framework search path via fork-resolving s.dependency ([e339501](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e339501d8f6ead8cc025710ae866b896420a8e0b)), closes [#if](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/if)
* **ios:** rename Swift parameter label to didCapture to satisfy VideoFrameProcessorDelegate ([6db3412](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/6db3412e4b9961d905448e62958bd48febcca3fd))
* **ios:** rename transpiled shaders to .metalsrc to bypass Xcode resource-bundle auto-compile ([c3967a0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c3967a054cff78481c014592c9bb9decc5dad92d))
* **plugin:** emit :path on the react-native-webrtc Podfile declaration ([42b7194](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/42b7194373b02ea19c9db821e5b6406a4aada229))
* **plugin:** raise consumer iOS deployment target to 15.0 via Podfile.properties.json ([11168ce](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/11168ce7f7abe620e91c5d74277228276a1d003d))


### Features

* **backgrounds:** add optimized WebP presets importable per preset ([ec6be4f](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/ec6be4fe9372dbb3c03df8bce71e42b93d977c13))
* **ios:** bundle background-image PNGs as a pod resource bundle ([4a9bc58](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/4a9bc58fa0fb02db871140b0b26e1e0de41e097c))
* **ios:** implement Metal effect pipeline (mirror, blur, background) ([8e4c9c0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/8e4c9c07a8edda587a16001189e15077e7fbb393))
* **ios:** support the @livekit/react-native-webrtc fork ([e041cda](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e041cda6505029bc0a885e2132102e6705212ef4)), closes [#if](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/if) [#elseif](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/elseif)
* **plugin:** patch iOS Podfile for react-native-webrtc modular headers ([5ada180](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5ada180ab35c6644f3687ae94173efee866c7f1a))
* **shaders:** add nebula and simianlights procedural backgrounds ([78f069a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/78f069ac9c8b8c2a048360051f5c2e11dd6ef957))
* **web:** add opt-in LiveKit TrackProcessor adapter ([202c6df](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/202c6df1d4e0429451b03399fba6afd0bb24a2e6))

# 1.0.0 (2026-05-19)


### Bug Fixes

* address reviewer-flagged defects across android, ios, and js facade ([7bf0632](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7bf0632cf8ac77d89e00bf584c2ed90a6371caa9))
* **android:** apply OES transform matrix + cover-fit background image UVs ([7d58d16](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7d58d16af86895d998b52e30a45ceba3ce559368))
* **android:** glFinish + detach FBO before handing off the output texture ([2863b40](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/2863b401f1cccbbabcba0231f6840a8c9f93902d))
* **android:** return null from blur fallback paths ([7c88aa2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7c88aa22fb5611a25a12593cada8fe493772cb18))
* **android:** sample mask without V-flip in composite shader ([76f92ed](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/76f92ede89891f1e220c1db023e4451becd2f212))
* **android:** wrap refresh:android in env -i so bun's nested install works ([d24d602](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d24d602e694b21acc2002fdd15951901197986eb))
* **demo:** bump android minSdkVersion to 24 for react-native-webrtc ([ee54358](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/ee543588960c0fdd1dc3b7f24b4003233d42cd25))
* **demo:** clamp Mask Hardness slider min to 0.01 to dodge upstream slider crash ([6788d81](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/6788d8186550aed3270cd0044881eefab60edd3e))
* **demo:** clear native effects when toggling all off ([7a54b26](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7a54b261951a65180f4e1d9d89a577a175e5d6bd))
* **demo:** drop newArchEnabled from app.config.ts ([cae7690](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/cae7690b221fccc045988bf70cacb16205f2dd2c))
* **demo:** switch kaleidoscope workspace dep from link:.. to file:.. ([f860cd1](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/f860cd1912baafbe729ec7d496eb862672d4ea44))
* **demo:** use Asset.fromModule for cross-platform asset URIs; drop favicon ref ([c432bdf](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c432bdf6581f77b4a0d153f593ff5ebdb2478f3d))
* **deps:** switch demo from bun to npm to work around bun file:.. cache bug ([2190ad1](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/2190ad1e647d5061d3fff73f7419f9e0f4b1c6af))
* **eas:** add demo/.easignore to skip recursive node_modules upload ([f7113f5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/f7113f583c614783d74dfb9824810a2a6e56121b))
* **facade:** pass null to _setVideoEffects when clearing effects ([55aa3e8](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/55aa3e88e6cf7a84adcb4039c81632f4af5d6f4b))
* **package:** conform exports to strict node16 ESM resolution ([33c56cb](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/33c56cb18b5fcfa6a7bf70327d03ab52669ea985))
* **package:** unbreak metro by reverting source .js extensions ([d2de4c4](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d2de4c4dcfc594d88ba127b5920edcc63e5518e4)), closes [#2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/2)
* **plugin:** use Node16 module/resolution for TS 6 ([713eaa3](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/713eaa31bf193caa482291e8ebd4c946494ddefc))
* **shaders:** apply shader-guru review findings to composite and all frag shaders ([f86ec7b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/f86ec7bd80636c50c7889d416327d2e0ecabc6ce))
* unify composite shader across web and android with shared texture-orientation convention ([c6f61b0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c6f61b0dea26655c78d8b3133346b43b47d7e1ef))
* **web:** clearRect the mask staging canvas each frame ([e8911b9](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e8911b9d1f534428773cd24dfd69acfcd91f38b5))
* **web:** flip mask V in composite shader so it aligns with the camera ([6a4febe](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/6a4febeb4287bc84568b0584b0993539400d12a8))
* **web:** flip V on background-image sampling so the bg is right-side up ([9204fef](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/9204fef95b88957890b6cf6cfd8bda1893098b25))
* **web:** sample mask without V-flip in composite shader ([3b82b3c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3b82b3c13f2a97ae7648b6468aff333157d7e1f9))
* **web:** stage mask and bg through OffscreenCanvas so flipY actually applies ([3ff715b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3ff715bc0a0e721582f65357268b20423bda21cd))


### Features

* add maskThreshold control to shift smoothstep center ([70b2d4a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/70b2d4a6552b73413a87f0ae612fff14cdf8a334))
* **android:** async MLKit segmentation and parameterized mask hardness ([409905c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/409905c3f5ec8c0c46618e48c229946d0f8d6d46))
* **android:** GPU passthrough effect (architecture proof) ([cb2dc8b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/cb2dc8bc00b7e7fd47f2d529b05b049c030c7d8a))
* **android:** GPU pipeline for blur and background-image effects ([612363e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/612363e6418cd1b1d66ab113e85bd49180ea83a3))
* **android:** implement blur via MLKit selfie segmentation ([7818b4b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7818b4b0587d6a9a635b9f2c098feb1534c69577))
* **android:** implement mirror via per-row I420 byte reverse ([5ae7806](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5ae7806870be6d3f9797403de236b4aaceabcf28))
* **android:** pre-computed blur kernel + lock-guarded process() + EAS install fix ([c0c4bb7](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c0c4bb7850dbd5bd566c1a96cc65e854a712c921))
* **android:** scaffold gpu/ subpackage for the GLES pipeline ([869d7fd](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/869d7fd79ecc2f90036551967948d3230d07901b))
* defensive error handling on the GPU pipeline and JS facade ([071ea4e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/071ea4e5748cd1cc1761890fa4ba3f7b70968d9a))
* **demo:** native camera via rn-webrtc mediaDevices and RTCView ([97e9c3f](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/97e9c3fa4b410e005af12a5a1d89fbb45d2e849f))
* **facade:** wire _setVideoEffects through the native JS facade ([064bb1e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/064bb1ea3b988ab66880200ed2a717634e8b5dda))
* **ios:** set up GLSL -> SPIR-V -> MSL transpilation pipeline ([5d3626c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5d3626c80775e9a10a02eca5a637365c9473b9df))
* runtime-tunable effect parameters (blur sigma, mask hardness) ([214f7f4](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/214f7f42dc82f48a140109b92f1b5a5b14342c3c))
* **web:** parameterized EffectSpec API and background-image effect ([fac6826](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/fac6826350bd09f5b28a41b353db2c69c5a02a1d))
* **web:** tighten mask edge with smoothstep in both composite shaders ([6b43108](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/6b431086c85cb6ee4cd666fb0382c356ecb5e266))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Subsequent entries are managed automatically by [`semantic-release`](https://semantic-release.gitbook.io).

## [Unreleased]

Pre-1.0 development. Entries land here automatically on the first `semantic-release` cut.

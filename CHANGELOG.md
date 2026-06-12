# [2.3.0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v2.2.2...v2.3.0) (2026-06-12)


### Features

* **components:** seed control forms through an optional patches override ([1e49e3a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1e49e3ad926181de5216b64d4ea698e30472736a))
* **demo:** persist the selection through KaleidoscopeStateProvider ([789febf](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/789febfcca2292f1ea612b7e9d703715100328af))
* **kaleidoscope:** merge switch-time patches into the rebuilt layer stack ([664209f](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/664209f30e437c1386d4dca5c78e41684f896e0e))
* **persistence:** add persisted-selection provider over a storage-agnostic store ([4f11d33](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/4f11d3313ea201c4e60a1179379abaa11fd2581d))

## [2.2.2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v2.2.1...v2.2.2) (2026-06-12)


### Performance Improvements

* **clouds:** drop fbm to 4 octaves and march 32 growing steps ([6a66ed4](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/6a66ed4225ac01cc0324e4db485ddc82d7ded96b)), closes [#37](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/37)
* **nebula:** cull invisible stars, gate flares, drop to 8 layers ([bf35d10](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/bf35d10fa1dfec0c41332ce06b75036d17644bfc)), closes [#39](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/39)

## [2.2.1](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v2.2.0...v2.2.1) (2026-06-12)


### Bug Fixes

* **plugin:** parse formatter-wrapped require bindings, warn on unparseable image layers ([0f50409](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/0f5040901013de2a95dda4e087e66826e86ba27e)), closes [#48](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/48)

# [2.2.0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v2.1.1...v2.2.0) (2026-06-11)


### Features

* **livekit:** expose setMaskTuning on the /livekit subpath ([5687fa0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5687fa0d9a86c243e15b2c84a530244cdcac6cc4)), closes [#47](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/47)

## [2.1.1](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v2.1.0...v2.1.1) (2026-06-10)


### Bug Fixes

* **build:** skip lefthook install when the binary is absent ([2cdcb9f](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/2cdcb9fb9861461939182b6d079d9b2164e5d5e4))

# [2.1.0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v2.0.0...v2.1.0) (2026-06-10)


### Bug Fixes

* **android:** apply transforms chained after art effects ([8f57a8d](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/8f57a8d498f55d8a6fcf92a467b6f994c38331ed))
* **android:** capture applicationContext for thumbnail resolution ([a6efc2b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/a6efc2b93ee8e0b172737ef8b38d8777ff88b94e))
* **android:** load background thumbnails via asset:// scheme ([c32554b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c32554bed4f2d4ad96cc3a178a7b0671b760be5e))
* **android:** resolve background thumbnails via assets.open() not list() ([e987cb3](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e987cb308bf36bf1ef9c058145c94b10cf58af2e))
* **build:** emit CommonJS dist and gate publint --strict (S1) ([568ba8e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/568ba8e2610f7c35098d075b9ecae9989b63f68f))
* **build:** make the ./ui subpath consumable by non-Metro web bundlers ([a8c2076](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/a8c20764e54ee236dbc9aff3ce25bf12853b8773))
* **components:** restore ColorPickerProps type name ([2081017](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/2081017045dcb622737fcf947e80bbd1182781ac))
* **composites:** split thumbnail resolution into native/web variants ([db99ae2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/db99ae203488c6073e5f9907b5a4671370768f86))
* **demo:** add react-native-reanimated, NativeWind v4's required peer ([da9b704](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/da9b70465ced3fa7e3466f64465963345353d67e))
* **demo:** apply transform after art; two single-select banks ([d639728](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d639728eef6026fcd269923ac53ec6a3d3a7df3e))
* **demo:** composite the person over Backgrounds presets ([d84618e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d84618e468676e5da6da4034a79bbea8dea2c22e))
* **demo:** defer the mask sliders to client render to silence the SSR warning ([3c171f3](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3c171f3b9b50f3834982cb8a642b20d5774adf1a))
* **demo:** hoist react-native-css-interop to a direct dep for EAS ([0e95576](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/0e95576620c8b1207464ead50aa40f0e626d1274))
* **demo:** scope the Metro single-instance force to React only ([290d752](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/290d7522858a465ddf2473aaf038a57993364009))
* **demo:** set complete uniforms on the interior presets ([bc4390b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/bc4390b3d151d9fe77903accd626127eb70ed6cc))
* **ios:** accept Optional primitives in expo-modules Function setters ([f59867e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/f59867ea454f0bba06c17352d59a0bdcfe346a51))
* **ios:** bind composite-masked to its real 4-buffer layout by name ([84ec10a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/84ec10a8b7efcaed8cd85838239e9d81e199b01d))
* **ios:** bind composite-subject mask thresholds by name, not position ([278aef7](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/278aef74a1d7f9664db1ac7962868a4d7e0f2a0b))
* **ios:** declare numeric expo-module Function params as Double ([185508f](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/185508fa5ac3a64b969f9698e6062f2c2f4697b9))
* **ios:** pin MediaPipeTasksVision to 0.10.14 to match Android, not the floating range ([9b17d95](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/9b17d959e2d3287b39666117815dcbe4935eb39a))
* **ios:** unwrap the pipeline color-attachment optional ([75ebcbe](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/75ebcbeb9a72e5b02b53a6e93f07f20eb076597b))
* **picker:** floor tile height to defeat Yoga aspectRatio collapse ([709293c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/709293c12d797d8199213a8a4ddcfb4246916acf))
* **plugin:** bundle packaged composites' plates into the native build ([c4fba75](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c4fba75ebb82bd31ea404ee41d869fea92b3d310))
* **plugin:** resolve require-binding image sources so consumer assets bundle ([d6b291e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d6b291e77c8043342f75bb71b5674900bcbd1bb3))
* **test-id:** drop the polynomial edge-trim in slug ([7d0195c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7d0195cca104cf21faa15717bb4fbaf15b775eda)), closes [#9](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/9)
* **types:** reject bare 'composite' as an effect input ([d908e1a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d908e1a8e508e0cf88a4f7841526968df03daf6c))
* **ui:** add group a11y roles and hoist the native-module lookup ([90be1e3](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/90be1e337f1362db2e851e826c2e260100650d50))
* **ui:** address re-review a11y and doc nits ([c6208af](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c6208af232c612abe6e4647de0a4170615f08ded))
* **ui:** relocate the nativewind interop to a top-level subpath ([14bf74e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/14bf74e3826bd85b3d480891edd37daf9bef78f9))
* **web:** revert live layer overrides to baked uniforms on preset switch ([56b0cb7](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/56b0cb7dc7b99c6e5a8bb63018a61c0ea47787a6))


### Features

* **android:** generalize the compositor to all layer kinds ([590cd06](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/590cd0656072df375a441cb450b4ef9535b98345))
* **android:** native scene compositor for layered shader scenes ([51691d5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/51691d53337e9d81efc8871b1afd077baaa97a30))
* **api:** add kaleidoscope() command over a typed preset book ([2eb93d5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/2eb93d575f86391489aefc2f970c14c00ae3c31c))
* **api:** route per-spec blur sigma through the effect-tuning channel ([5c71e97](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5c71e97352126aabf54205fa06ff0a76d898ec12))
* **beams:** per-beam toggles and runtime mote count ([77f0238](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/77f0238074af782e8add03c3637ae9a4af4ad878))
* **blur:** make the blur slider expressive across web, Android, and iOS ([af3ee40](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/af3ee4017ade8aca04b8538185f5f89d8836d807))
* collapse every effect into one layered composite ([28a7398](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/28a73984f4e070726f0eb9a6f7be80520903bf90))
* **composites:** add turnkey controls forms per tunable composite ([288f01c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/288f01ca8dd5ce3a0d3db4b75af76ef7be88a5b9))
* **composites:** add wizard-tower-night, fairy-grotto, and fairy-hollow ([795890e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/795890ee5521c3cb041ff926aa9fc715748ebe92))
* **controls:** add Control dispatcher, switch + polygon kinds ([6ab8ea6](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/6ab8ea6c18e4e59c2b8ad593cdf1534c552528bd))
* **controls:** add field primitives, makeControls, and nativewind registration ([a8cdc23](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/a8cdc230fab663527cb3c361fe537526db3ea3b8))
* **controls:** add KaleidoscopeMaskControls and KaleidoscopeTransformControls ([063e906](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/063e906b2702b32f77d9174e6fc3a5196d702491))
* **controls:** add KaleidoscopeTuner and the book-entry controls field ([4030dde](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/4030dde03becaac22bbe46731dfab85318daef76))
* **controls:** add per-shader forms and retire light-shaft ([0bb01e5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/0bb01e5f6d6db35633512c63477bbe598b1d851a))
* **controls:** add the ./controls subpath and theme provider ([356753a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/356753a54da4f0efa1b0e968704dce5b86759f3f))
* **controls:** add the ControlForm micro-provider and useField ([9df0502](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/9df0502d1c4465560f050b0b4f715a232a2b8851))
* **controls:** add the ControlSection chrome with a web-only copy button ([4541a20](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/4541a20a7f25aac945be173ef732289003735519))
* **controls:** add the data-driven UniformControls renderer ([e11bae4](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e11bae499965bfe1cc79c9d382fd43815b08b719))
* **controls:** apply generated field test ids in the primitives ([1e9258c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1e9258c4b0a007687f49067596b4bdc95034c775))
* **controls:** test ids and a11y labels on transform controls ([a9cb679](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/a9cb67937f6399e8c1b30516e25b5938c3a4a796))
* **controls:** test ids on mask controls ([9612956](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/9612956cdd2bc014a729a117df1394cf791c607e))
* **controls:** thread preset scope to the field hook ([d4c98e3](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d4c98e3e974e27859563c0cc73cb40d10357d02c))
* **demo:** add a demo-owned background image (consumer-add path) ([fcd8dd9](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/fcd8dd9868d6c422bd9b320d366337feb63f7226))
* **demo:** add composed scenes with per-layer tuning controls ([f249b24](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/f249b24824d15804b9714043774621fc9273098a))
* **demo:** add development-sim eas profile ([11067bd](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/11067bd01c3b635140bf917710718294d1920bdf))
* **demo:** add plasma shader presets to the demo ([d4bf504](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d4bf5048c7c03f6920753e5f330e6041e73f7186))
* **demo:** add Worlds/Interior presets with light-shaft overlays ([3ef1749](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3ef1749ae1b919ca80f365c92013d9b3517cbf71))
* **demo:** badge the demo-owned background tile ([c82f3de](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c82f3dea450dc2bc6c683bad94acb0a0d8cf21b3))
* **demo:** consume the packaged controls; delete the hand-rolled editor ([941d434](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/941d43469ee4b61a923d49f118f6c08e7525bb9a))
* **demo:** default mask to hardness 0.6, threshold 0.75 ([9348b3c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/9348b3ca1457c12c4ce262409fc58444c6e625b4))
* **demo:** dogfood the library KaleidoscopePicker ([3cbb1d9](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3cbb1d99af589e5e8b6c44186e0997e5ec0641ac))
* **demo:** list wizard-tower-night, fairy-grotto, and fairy-hollow ([b4afdb4](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/b4afdb47552265ed492f3055fb0a9c007d931b2e))
* **demo:** render backgrounds as a thumbnail menu ([3111f40](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3111f409fb4f9e9befbbeb333b8b37dae20037b6)), closes [#28](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/28)
* **demo:** style the dogfooded picker with NativeWind ([3bbf31f](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3bbf31f02e94cf32c8f93fe2ec0837015592cf32))
* **demo:** use a real wolf-cave image for the demo-owned background ([38e6635](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/38e663502eca17c51b9604e654cc9afcbe0e065a))
* **fireflies:** make the firefly tint a uColor uniform ([57f679b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/57f679b783df7b711640d956ab6c9ef4ccde0b10))
* **images:** add 320x180 thumbnails for the background plates ([dde93b5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/dde93b5533d1b8e311cc5f3f4660e9e342ac59be))
* **ios:** composite scene layers natively ([16dc719](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/16dc719303094244b8966e5b8659ee9263ed4eb0))
* **ios:** generalize the compositor to all layer kinds ([c823295](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c823295b8103e8b34b9350b36ec6753da138f5d7))
* **light-shaft:** add a single-beam interior light shader ([9c56145](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/9c56145d01b956c690efe9df79414405079255c4))
* **native:** generic shader processor and prebuild background copy ([b9115ad](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/b9115adf96595edc4ebc9d6269d86ea7e4d1ffc0)), closes [#32](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/32) [#33](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/33)
* **native:** resolve background thumbnail URIs on Android and iOS ([708a9ec](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/708a9ec4da31d0cf4c4655bb19641a768b2a1b18))
* **picker:** render every preset as a uniform thumbnail tile ([13d6bd3](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/13d6bd3854a5fa8e75d186b9b6c3210dd05b005a))
* **plugin:** bundle composite thumbnails into native app target ([5e823ac](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/5e823acdd23bbb664cc8dd9d477c85a4a6a94554))
* **plugin:** copy curated backgrounds into the Android bundle at prebuild ([95e6422](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/95e64225b13b354fe93648f4c43715fa37d8956f))
* **scene:** add layered shader compositor and per-shader type files ([b1fbc5a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/b1fbc5a683dc7eaa5282bdb19420a55d0311456d))
* **scripts:** show GPU-independent static op cost in shader:view ([4176c2d](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/4176c2d03322c9cd5fe0a8cc0f5d6874d0a8ea4e))
* **scripts:** split shader:view controls per-side + typed number inputs ([aa6353c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/aa6353c1474fbaf1eeba3bbcf37b852fb18a6b00))
* **shaders:** add beams-and-motes and port clouds, fireflies to GLSL ES 3.00 ([e19f2ab](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e19f2ab4e4fbb5fcab7738ae11f525c7aaa267f7))
* **shaders:** add plasma two-color time-morph specimen ([876881e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/876881e4cce11961b65fe4c8835094ebbc304ca9)), closes [25/#26](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/26)
* **shaders:** single-source the generative registry across platforms ([1a9fd7b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1a9fd7b3d5440189e34a1ac42981f7bbeeefd697))
* **test-id:** add the deterministic test-id grammar ([ac7cee8](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/ac7cee8cd288ebe37b6b74ea1d239d9cabb8f29e))
* **tools:** add --magenta hue-alpha mode to chroma-strip ([24e08f1](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/24e08f1faa6f01b690b360902ed04c4cf1895ba2))
* **ui:** add BackgroundGrid and PresetOptions family renderers ([dd703a8](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/dd703a892d0256dfe99c09280cc46120257bf112)), closes [#28](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/28)
* **ui:** add KaleidoscopePicker composite, usePicker, and PickerLayout ([7177c0a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7177c0af16f6aa777b6209da8f240b4efa163e3e)), closes [#28](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/28)
* **ui:** add opt-in NativeWind interop subpath ([86078fd](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/86078fd31a81314c76a19a83d2b9f515b246223d))
* **ui:** add preset-tile and preset-option leaves ([898252e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/898252e392b92c1f1d7a76a442bc5882dad1984b)), closes [#28](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/28)
* **ui:** add the category menu as the picker's second axis ([62aacbf](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/62aacbf752a3be9fa6370b0f27ac87fc0a908739))
* **ui:** resolve thumbnail URIs via a platform-split resolver ([dc239e3](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/dc239e330e6a06c4ea4ce8012e4b2b927176a76b))
* **ui:** scaffold the ./ui picker subpath and shared types ([ff0ddc5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/ff0ddc5d5e11c580e0935185f5716e3bcfc72a1d)), closes [#28](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/28)
* **ui:** test ids on the picker family tabs and category menu ([633a44b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/633a44bd8936648588e5786ffb779c79a83c5ab3))
* **ui:** test ids on the preset tiles via the render-prop ([edbbe27](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/edbbe276a5e13682a032eedf095a64f50c6951b4))
* **web:** generalize the scene compositor to all layer kinds ([a2a680c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/a2a680c6084ffb9742285141630a374d8a82b859))
* **web:** run plasma through a WebGL2 procedural-shader processor ([e728a24](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e728a2461c3a40de3631bb386fe5cf4c7c1e281f))


### Performance Improvements

* **clouds:** bound the raymarch to the cloud slab and retune ([fea7bf1](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/fea7bf17ddb2efd673352b3cfbb62ebe312a4275)), closes [#37](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/37)
* **light-shaft:** single-winding quadMask ([c745871](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/c745871286ab8faf34c890cc01ba4dab0d441ef1)), closes [#38](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/issues/38)
* **shaders:** lossless ALU reductions across the generative set ([26bff67](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/26bff678bc72581fd5a754281d5adbd9887bc23d))

# [2.0.0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/compare/v1.1.0...v2.0.0) (2026-05-25)


* feat(transform)!: replace mirror with flip-x/flip-y/rotate-cw/rotate-ccw ops ([01d8e91](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/01d8e9189025a147c2e2ec88935a51127c3fa987))
* refactor(backgrounds)!: rename office presets to dark-office and light-office ([a787426](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/a78742672c065b5db837719fcec4c4076dfafa5d))


### Bug Fixes

* **android,ios:** correct the rotate-cw/ccw direction (was reversed) ([0f24516](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/0f245163ddd60437c5c7e566524ffeeb51d3abeb))
* **android,ios:** downsample before blurring, matching the web serration fix ([372df09](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/372df09938f502d8c32a4ddde9703eb9b64c5aed))
* **android,ios:** make mirror a screen-horizontal flip under portrait rotation ([8978304](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/8978304b838bfd0ffeb970129e5b6b8846218182))
* **android,ios:** rotate clockwise on the clean sampled space ([d1528cf](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d1528cfe7df6446937d1a6f3a3583c3549fa1363))
* **android,ios:** set rotate-cw/ccw to the device-confirmed chirality ([eb4de15](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/eb4de15c02f5728a33a88a74fe814374d89ea4e4))
* **android:** align segmentation short-side clamp floor to 128 ([1e0fdbe](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1e0fdbedf80dc9903c0a1f63d9f5ee3410b4ddfe))
* **android:** close MPImage in finally to avoid a leak on segment failure ([e421972](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e421972117359844fcfb0c91209e357837301e98))
* **android:** drop enableRawSizeMask to restore mask quality ([64aec90](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/64aec90bcba0542366b08e2de79b661fa432afa5))
* **android:** feed the segmenter an upright frame (glReadPixels is bottom-up) ([e3e93d9](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/e3e93d918efaae2719bcd241b9bbebcdada44b1f))
* **android:** sample transform ops in buffer space, not screen space ([96fe41b](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/96fe41b4424b73bc796d432149c221451328b469))
* **android:** share one segmentation worker + segmenter process-wide ([8286dd7](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/8286dd730c85b8c824282c2e6c4be67bf90d88b0))
* **demo:** show the native preview with contain, not cover ([87efdec](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/87efdec588cc2c4050481d5ddab4869898fcd166))
* **ios:** apply the ingest de-mirror in display space, not source space ([64e9d28](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/64e9d28ddd2b6887ed3ba19c7b7efd6c71e671e3))
* **ios:** cancel the blurred-background vertical flip in the composite ([15a5dba](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/15a5dba8e387a209b563d84b517b2ecf00b4ae91))
* **ios:** copy the Vision mask into an owned buffer to stop the drift ([34dd70e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/34dd70e398312be2d0a24f86607c29b7e7b58259))
* **ios:** de-mirror the ingest and pool the mask buffer ([23c4fa2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/23c4fa2d71e56e3607b1a0a94da59707335dc0d2))
* **ios:** drop the half-wired setSegmentationQuality bridge; guard registry parity ([6a7d7e5](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/6a7d7e5ebff856cffd62b066b83e80a4624b87f9))
* **ios:** flip the background texture vertically at the composite ([39612f6](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/39612f67172d5bdf8d45bb809878e0656f30d525))
* **ios:** guard non-finite confidence before UInt8 mask quantize ([76369c2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/76369c206c74347ed0ee1bdab4b5d9ff914b1f07))
* **ios:** mask.float32Data is non-optional; drop the illegal guard let ([9635ea4](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/9635ea446ba805d6baafb7d1e1fd46a0be6bfac3))
* **ios:** orient the background image to the display via shared Orientation ([f26df0e](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/f26df0eae56606eb34d9b7a5d548484b392e7cea))
* **ios:** pool the original ingest buffer to fix in-flight read races ([ef7eb18](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/ef7eb1862b2e591e9c4875110d56e865534e3c09))
* **ios:** retain the mask buffer and texture until the GPU pass completes ([1417932](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/141793241a0de0605cd9a753b35e2999f29927bb))
* **ios:** set Vision quality back to .balanced (.fast was unusable) ([a3c36ef](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/a3c36ef1969d274a1017a9d6193bea224e1c4231))
* **ios:** vertical-flip bracket so the segmenter sees an upright frame ([7df65b7](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7df65b75ec7e3ba9fa93d47c1fa07cd9439c0ef2))
* **segmentation:** restore quality lowered in the perf pass ([1c1e419](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1c1e419f86781ebf58ee62964c9dabd33da1d748))
* **web:** downsample before blurring to kill directional serration ([8681f2a](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/8681f2a2ce3f5e09522775606c2bf10cd6f129be))


### Features

* **android,ios:** register flip/rotate ops via a shared Orientation helper ([74cd4eb](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/74cd4eb0fe64a9241ff203dbea1e1ea269166993))
* **android:** segment via MediaPipe ImageSegmenter instead of MLKit ([56b3a67](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/56b3a67a603844906596f5c8cfadac34c62c9c3d))
* **android:** temporal-smooth the mask (EMA) and floor input at 256 ([282aca0](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/282aca0df01d7edc5251ae062a7f71c478225842))
* **backgrounds:** add 8 scene presets (home/nature/stylized/simiancraft, light + dark) ([daad424](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/daad4248b37e4bda408d15f7367d6622f9800151))
* **backgrounds:** add debug-resolutions calibration grid as first preset ([d0b291c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d0b291c03deeb13e6e4f34a2930319e8df424aeb))
* **demo:** give the debug grid its own row above the office presets ([3f26799](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/3f267993958bc680e2d5f9f289efb484f9e69279))
* **demo:** lay out Translate and Background toggles as 2-up grids ([1972afc](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1972afcac34aa7a337e35973e70a52d4bb94a96c))
* **demo:** stamp version, git sha, and build time on screen ([44978ca](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/44978ca858a6a8085fdadc85cd3bdc34a13a9564))
* **ios:** segment via MediaPipe ImageSegmenter instead of Vision ([36a2c6d](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/36a2c6d2636ac6ea1316364230deab3146c2abe2))
* set dialed-in effect defaults (sigma 5, hardness 0.5, threshold 0.7) ([1174bb6](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1174bb60f87c43108a851e934b79410d7189ad3f))
* **tuning:** expose segmentation resolution and debug timing as live knobs ([1459f50](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/1459f50c3f300436f3975dc45e1b3a66a3d6a3fd))
* **web:** default mask threshold to 0.7 ([2d7b5d2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/2d7b5d2125224788896aeca3a92b6309eafad7f1))


### Performance Improvements

* **android:** blur at quarter-area resolution (R1) ([0c64a79](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/0c64a797ba4af1b3e69f6b5c0a10ef459ba02d4d))
* **android:** pipeline frames with a GL fence, add GPU timing ([7784498](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/778449829091a5839fc393eec8774486ed1910ec))
* **ios:** blur at quarter-area resolution (R1) ([7d98092](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7d9809253b51e9e5a6494e79b9f73fbbcdaf7578))
* **ios:** downscale Vision input, pipeline frames, add GPU/CPU timing ([74d9955](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/74d99550f9dbaae0559b2a9757e2e2012a3e874a))
* **ios:** lower Vision quality to .fast now that the mask is drift-free ([ace7c9c](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/ace7c9c9be20dd619c01a4c16f77e21faf2a2234))
* linear-sampled blur kernel, 9 fetches per pass instead of 17 (R2) ([b7586bb](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/b7586bb7a7ae63b7ca66ce08f5f972ca594ca117))
* **web:** blur at quarter-area resolution (R1) ([0ab3f02](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/0ab3f028250132d8837488da73fdbd14648aafd3))
* **web:** cache blur uniform locations and add per-pass GPU timing ([83be5aa](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/83be5aa8df1df767f464563882a9f32830102e6c))
* **web:** cache composite uniforms and harden background source loading ([642b131](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/642b131668ef5c82712143cd3a08577a94325536))
* **web:** decouple segmentation from the render path (R6) ([d89c8ee](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/d89c8ee9638053b026692f8ddd3b52b66df79ad0))
* **web:** upload the background-image texture once, not per frame ([7f0bdf2](https://github.com/simiancraft/react-native-webrtc-kaleidoscope/commit/7f0bdf24f04f4374b7a56b91724f949711780cd9))


### BREAKING CHANGES

* the 'mirror' effect name and MirrorSpec type are removed; use the transform ops (flip-x is the former mirror, corrected to a screen-horizontal flip).
* the ./backgrounds/office-1 and ./backgrounds/office-2 export subpaths are renamed to ./backgrounds/dark-office and ./backgrounds/light-office.

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

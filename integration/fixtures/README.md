# Test fixtures

Static inputs for the integration tests.

- **`person.png`** — a framed human test subject; this image works for testing
  masking. Feed it to the emulator camera (`-camera-back imagefile:.../person.png`)
  so segmentation has a real person to find. Every masked effect (background
  replace, blur, and the shaders) composites the segmented person over the chosen
  background, so a real person in the frame is what makes the mask verifiable.

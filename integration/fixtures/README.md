# Test fixtures

Static inputs for the integration tests.

- **`person-framed.png`**: the camera-ready test subject; **feed this one** to the
  emulator (`-camera-back imagefile:.../person-framed.png`). It places the subject at
  the "great scale" framing (see the README) so he lands centered and fully in frame in
  the app preview. This image works for testing masking: every masked effect (background
  replace, blur, and the shaders) composites the segmented person over the chosen
  background, so a centered, segmentable person is what makes the mask verifiable.
- **`person.png`**: the bare full-body subject (transparent background) that
  `person-framed.png` is composed from. Regenerate the framed image from this if your
  emulator crops/shifts differently and needs a different offset.

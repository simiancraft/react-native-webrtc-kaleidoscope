// Composite compositor CAMERA layer (direct/background): the raw display-upright
// camera, fullscreen, opaque. The camera "original" is already display-upright
// (CoreImage ingest on iOS, OES->2D on Android) and is sampled in the output
// pass, so there is no V-parity term here. Output straight RGB with alpha 1 so
// the non-blended base draw fills the frame.
//
// Canonical single source for all three runtimes (build:shaders): web
// COMPOSITE_CAMERA_FRAG_SRC, Android Shaders.COMPOSITE_CAMERA_FRAG, iOS
// composite-camera.metalsrc. Do not hand-edit the generated copies.
#version 300 es
precision highp float;
uniform sampler2D uCamera;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  oColor = vec4(texture(uCamera, vUv).rgb, 1.0);
}

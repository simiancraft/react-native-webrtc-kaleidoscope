// Transform: a pure geometric reorientation of the input texture, an axis
// flip or a 90-degree rotation. One shader serves all four ops (flip-x,
// flip-y, rotate-cw, rotate-ccw); the host computes uUvTransform from the
// desired SCREEN-space op and the frame's rotation via its platform Orientation
// helper, so the camera-buffer rotation correction lives in exactly one place
// instead of being repeated per op or per effect.
//
// uUvTransform maps output UV (taken about the 0.5 center) back to input UV: a
// flip negates one axis; a 90-degree rotation swaps the axes, and the host
// allocates a dimension-swapped (h x w) output target to match. Because flips
// and 90-degree rotations map the unit square onto itself, the sampled UV stays
// in [0, 1] with no clamp.
//
// UV convention: vUv = (0, 0) bottom-left, (1, 1) top-right (see
// passthrough.vert). Web reorients in display space via canvas instead and does
// not use this shader.

#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform mat2 uUvTransform;
in highp vec2 vUv;
out vec4 oColor;
void main() {
  vec2 uv = uUvTransform * (vUv - 0.5) + 0.5;
  oColor = texture(uTex, uv);
}

#include <metal_stdlib>
#include <simd/simd.h>

using namespace metal;

struct main0_out
{
    float2 vUv [[user(locn0)]];
    float4 gl_Position [[position]];
};

vertex main0_out main0(uint gl_VertexID [[vertex_id]])
{
    main0_out out = {};
    float2 _22 = float2(float((gl_VertexID & 1) << 1), float(gl_VertexID & 2));
    out.vUv = _22 * 0.5;
    out.gl_Position = float4(_22 - float2(1.0), 0.0, 1.0);
    return out;
}


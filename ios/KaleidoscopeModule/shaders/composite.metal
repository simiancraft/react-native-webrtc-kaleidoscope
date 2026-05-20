#include <metal_stdlib>
#include <simd/simd.h>

using namespace metal;

struct main0_out
{
    float4 oColor [[color(0)]];
};

struct main0_in
{
    float2 vUv [[user(locn0)]];
};

fragment main0_out main0(main0_in in [[stage_in]], constant float2& uMaskUvScale [[buffer(0)]], constant float2& uMaskUvOffset [[buffer(1)]], constant float& uMaskHi [[buffer(2)]], constant float& uMaskLo [[buffer(3)]], constant float2& uBgUvScale [[buffer(4)]], constant float2& uBgUvOffset [[buffer(5)]], texture2d<float> uMask [[texture(0)]], texture2d<float> uOriginal [[texture(1)]], texture2d<float> uBackground [[texture(2)]], sampler uMaskSmplr [[sampler(0)]], sampler uOriginalSmplr [[sampler(1)]], sampler uBackgroundSmplr [[sampler(2)]])
{
    main0_out out = {};
    out.oColor = float4(mix(uBackground.sample(uBackgroundSmplr, fast::clamp((in.vUv * uBgUvScale) + uBgUvOffset, float2(0.0), float2(1.0))).xyz, uOriginal.sample(uOriginalSmplr, in.vUv).xyz, float3(smoothstep(uMaskLo, fast::max(uMaskHi, uMaskLo + 0.001000000047497451305389404296875), uMask.sample(uMaskSmplr, ((in.vUv * uMaskUvScale) + uMaskUvOffset)).x))), 1.0);
    return out;
}


#pragma clang diagnostic ignored "-Wmissing-prototypes"
#pragma clang diagnostic ignored "-Wmissing-braces"

#include <metal_stdlib>
#include <simd/simd.h>

using namespace metal;

template<typename T, size_t Num>
struct spvUnsafeArray
{
    T elements[Num ? Num : 1];
    
    thread T& operator [] (size_t pos) thread
    {
        return elements[pos];
    }
    constexpr const thread T& operator [] (size_t pos) const thread
    {
        return elements[pos];
    }
    
    device T& operator [] (size_t pos) device
    {
        return elements[pos];
    }
    constexpr const device T& operator [] (size_t pos) const device
    {
        return elements[pos];
    }
    
    constexpr const constant T& operator [] (size_t pos) const constant
    {
        return elements[pos];
    }
    
    threadgroup T& operator [] (size_t pos) threadgroup
    {
        return elements[pos];
    }
    constexpr const threadgroup T& operator [] (size_t pos) const threadgroup
    {
        return elements[pos];
    }
};

struct main0_out
{
    float4 oColor [[color(0)]];
};

struct main0_in
{
    float2 vUv [[user(locn0)]];
};

fragment main0_out main0(main0_in in [[stage_in]], constant spvUnsafeArray<float, 9>& uWeights [[buffer(0)]], constant float2& uAxis [[buffer(9)]], constant spvUnsafeArray<float, 9>& uOffsets [[buffer(10)]], texture2d<float> uTex [[texture(0)]], sampler uTexSmplr [[sampler(0)]])
{
    main0_out out = {};
    float4 _81;
    _81 = uTex.sample(uTexSmplr, in.vUv) * uWeights[0];
    for (int _80 = 1; _80 < 9; )
    {
        float2 _52 = uAxis * uOffsets[_80];
        _81 = (_81 + (uTex.sample(uTexSmplr, (in.vUv + _52)) * uWeights[_80])) + (uTex.sample(uTexSmplr, (in.vUv - _52)) * uWeights[_80]);
        _80++;
        continue;
    }
    out.oColor = _81;
    return out;
}


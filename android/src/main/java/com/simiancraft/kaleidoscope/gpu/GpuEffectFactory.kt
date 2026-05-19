// VideoFrameProcessorFactory for GPU-based effects. v0.1 ships one shared
// factory; each registered effect name gets its own GpuEffectProcessor
// instance via build(). When effects diverge in their constructor needs
// (uniforms, asset references, mask config), this factory takes a config
// object so the registration code can configure each effect distinctly.

package com.simiancraft.kaleidoscope.gpu

import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface

internal class GpuEffectFactory : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = GpuEffectProcessor()
}

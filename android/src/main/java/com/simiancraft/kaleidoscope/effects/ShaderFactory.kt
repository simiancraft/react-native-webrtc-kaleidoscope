// Android generic generative-shader effect — GPU pipeline.
//
// One factory class serves EVERY generative shader in ShadersGenerated.GENERATIVE
// (currently "plasma"); the shader name selects the fragment source at
// construction. There is NO per-shader Kotlin code: uniforms are bound by name
// from the ShaderUniforms side-channel, so adding a generative .frag (which
// regenerates GENERATIVE) registers and runs with no change here.
//
// Per frame (mirrors BackgroundImageFactory, with the image swapped for a
// procedural render):
//   1. Render the input OES camera texture into a cached "original 2D" FBO.
//   2. Render the generative shader into a cached "background" FBO at display
//      size, setting uTime (host monotonic seconds), uResolution, and each
//      uniform from ShaderUniforms.get(shaderName) bound generically by name.
//   3. Produce a mask via Mask.produce (downsample, MediaPipe, upload).
//   4. Composite original + shader-background + mask into a fresh output
//      texture via COMPOSITE_FRAG.
//   5. Hand the texture through FramePipeline (one-frame fence) and wrap the
//      previous frame's GPU-complete texture in a TextureBufferImpl.
//
// The generative shader writes an opaque full-frame background (it ignores the
// input); the person is composited over it through the mask. The background FBO
// is the same display dims as the original, so the composite uses an identity
// bg UV transform (no cover-fit; the shader already fills the quad).
//
// All failure paths log under Kaleidoscope.Shader and fall through to null so
// upstream forwards the original frame instead of crashing.

package com.simiancraft.kaleidoscope.effects

import android.content.Context
import android.graphics.Matrix
import android.opengl.GLES30
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import com.simiancraft.kaleidoscope.EffectTuning
import com.simiancraft.kaleidoscope.ShaderUniforms
import com.simiancraft.kaleidoscope.gpu.Egl
import com.simiancraft.kaleidoscope.gpu.Fbo
import com.simiancraft.kaleidoscope.gpu.FramePipeline
import com.simiancraft.kaleidoscope.gpu.GlDebug
import com.simiancraft.kaleidoscope.gpu.GlProgram
import com.simiancraft.kaleidoscope.gpu.Ingest
import com.simiancraft.kaleidoscope.gpu.Shaders
import com.simiancraft.kaleidoscope.gpu.ShadersGenerated
import com.simiancraft.kaleidoscope.segmentation.Mask
import com.simiancraft.kaleidoscope.segmentation.MaskTuning
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.YuvConverter

/**
 * @param context held for Mask (the segmentation GL adapter needs a Context to
 *   reach the shared SegmentationEngine); also matches BackgroundImageFactory's
 *   shape so registration is uniform.
 * @param shaderName key into [ShadersGenerated.GENERATIVE]; selects the
 *   generative fragment source. The same name is the ProcessorProvider key and
 *   the ShaderUniforms key, so JS's setShaderUniforms(name, ...) targets this
 *   processor's uniforms.
 *
 * The fragment source is resolved when the processor is built (in
 * ShaderProcessor's init, via build()) so an unknown name fails loudly once
 * rather than per frame. In practice the name is always a GENERATIVE key (the
 * registration iterates that map), so the failure is unreachable.
 */
class ShaderFactory(
  private val context: Context,
  private val shaderName: String,
) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = ShaderProcessor(context, shaderName)
}

private class ShaderProcessor(
  private val context: Context,
  private val shaderName: String,
) : VideoFrameProcessor {
  // process() is only ever invoked on the single SurfaceTextureHelper capture
  // thread (VideoEffectProcessor.onFrameCaptured), so this never actually
  // contends. Retained as cheap uncontended insurance and as an explicit marker
  // that the GL state below is single-threaded; it is NOT a cross-thread guard.
  private val lock = Any()

  // Generative fragment source for this shader, resolved once.
  private val fragmentSource: String =
    ShadersGenerated.GENERATIVE[shaderName]
      ?: error("Kaleidoscope: no generative shader named '$shaderName' in GENERATIVE")

  private var oesToTwoD: GlProgram? = null
  private var shaderProgram: GlProgram? = null
  private var compositeProgram: GlProgram? = null

  private var originalFbo: Fbo? = null
  private var backgroundFbo: Fbo? = null
  private var cachedWidth = 0
  private var cachedHeight = 0

  private val mask = Mask(context)
  private var yuvConverter: YuvConverter? = null

  // R3: one-frame GPU pipeline (see FramePipeline). Replaces the per-frame
  // glFinish so the capture thread does not block on this frame's GPU work.
  private val pipeline = FramePipeline()

  // Host monotonic clock origin for uTime. The shader expects seconds since an
  // arbitrary epoch; we anchor at first frame so values stay small and precise
  // in a 32-bit float (System.nanoTime() absolute is too large for mediump-
  // adjacent precision, though uTime is highp in plasma.frag). nanoTime is
  // monotonic and unaffected by wall-clock changes, which is what an animation
  // clock wants.
  //
  // Precision is deliberately left to degrade gracefully rather than wrapped:
  // float32 keeps sub-frame resolution through ~1h of elapsed time and only
  // reaches ~half a frame near ~18h, which is past any teleconference. A modulo
  // wrap would bound it but inject a one-frame discontinuity each period (a
  // seamless wrap needs a per-uSpeed multiple of 2*PI, which the generic path
  // can't know), so for a call-duration effect graceful degradation wins.
  private var startNanos: Long = 0L

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return synchronized(lock) { processOuter(frame, textureHelper) }
  }

  private fun processOuter(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return try {
      processInner(frame, textureHelper)
    } catch (t: Throwable) {
      Log.e(
        TAG,
        "process() threw; falling through. shader=$shaderName " +
          "frame=${frame.buffer.width}x${frame.buffer.height} " +
          "rotation=${frame.rotation} bufferClass=${frame.buffer.javaClass.simpleName}",
        t,
      )
      null
    }
  }

  private fun processInner(
    frame: VideoFrame,
    textureHelper: SurfaceTextureHelper?,
  ): VideoFrame? {
    if (textureHelper == null) {
      Log.w(TAG, "textureHelper is null; falling through.")
      return null
    }
    val inputBuffer = frame.buffer
    if (inputBuffer !is VideoFrame.TextureBuffer) return null
    if (inputBuffer.type != VideoFrame.TextureBuffer.Type.OES) {
      Log.w(TAG, "TextureBuffer type is ${inputBuffer.type}; expected OES. Forwarding.")
      return null
    }
    val bufW = inputBuffer.width
    val bufH = inputBuffer.height
    if (bufW <= 0 || bufH <= 0) {
      Log.w(TAG, "Degenerate dims ${bufW}x${bufH}; forwarding.")
      return null
    }

    // Ingest normalization: the OES->2D pass lands a DISPLAY-UPRIGHT frame, so
    // the original/background FBOs and output are sized in DISPLAY dims and the
    // frame goes out rotation 0.
    val width = Ingest.displayWidth(bufW, bufH, frame.rotation)
    val height = Ingest.displayHeight(bufW, bufH, frame.rotation)

    GlDebug.check("shader entry")
    val saved = Egl.save()
    var outputTextureId = 0
    var outputFboHandle = 0
    return try {
      ensurePrograms()
      ensureIntermediates(width, height)
      if (startNanos == 0L) startNanos = System.nanoTime()

      val origFbo = originalFbo ?: error("originalFbo null after ensure")
      val bgFbo = backgroundFbo ?: error("backgroundFbo null after ensure")
      val oes = oesToTwoD ?: error("oesToTwoD null after ensure")
      val shader = shaderProgram ?: error("shaderProgram null after ensure")
      val composite = compositeProgram ?: error("compositeProgram null after ensure")

      // ===== Pass 1: OES camera -> "original 2D" =====
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GL_TEXTURE_EXTERNAL_OES, inputBuffer.textureId)
      origFbo.bind()
      oes.use()
      oes.setInt("uTex", 0)
      val texMatrix = Ingest.composedTexMatrix(inputBuffer.transformMatrix, frame.rotation)
      GLES30.glUniformMatrix4fv(oes.uniformLocation("uTexMatrix"), 1, false, texMatrix, 0)
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("shader OES->2D")

      // ===== Pass 2: generative shader -> background FBO =====
      bgFbo.bind()
      shader.use()
      // Built-in uniforms always provided by the host. Locations may be -1 if a
      // given shader omits one; glUniform* on -1 is a documented no-op.
      val elapsedSeconds = ((System.nanoTime() - startNanos) / 1e9).toFloat()
      GLES30.glUniform1f(shader.uniformLocation("uTime"), elapsedSeconds)
      GLES30.glUniform2f(shader.uniformLocation("uResolution"), width.toFloat(), height.toFloat())
      bindUniforms(shader)
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("shader generative pass")

      // ===== Mask from the 2D original =====
      val maskTexId = mask.produce(origFbo.texture, width, height)
      if (maskTexId == -1) {
        Log.w(TAG, "Mask production failed; falling through.")
        return null
      }

      // ===== Composite (orig + shader-bg + mask -> fresh output) =====
      val outputFbo = Fbo(width, height)
      outputTextureId = outputFbo.texture
      outputFboHandle = outputFbo.framebuffer

      outputFbo.bind()
      composite.use()

      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, origFbo.texture)
      composite.setInt("uOriginal", 0)

      GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, bgFbo.texture)
      composite.setInt("uBackground", 1)

      GLES30.glActiveTexture(GLES30.GL_TEXTURE2)
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTexId)
      composite.setInt("uMask", 2)

      // The shader background already fills the display-sized FBO; identity bg
      // UV transform (no cover-fit needed, unlike an arbitrary-aspect image).
      composite.setVec2("uBgUvScale", 1.0f, 1.0f)
      composite.setVec2("uBgUvOffset", 0.0f, 0.0f)
      // Identity mask UV — round-trip leaves mask aligned with origFbo.
      composite.setVec2("uMaskUvScale", 1.0f, 1.0f)
      composite.setVec2("uMaskUvOffset", 0.0f, 0.0f)

      val (maskLo, maskHi) =
        MaskTuning.smoothstepRange(EffectTuning.maskHardness, EffectTuning.maskThreshold)
      GLES30.glUniform1f(composite.uniformLocation("uMaskLo"), maskLo)
      GLES30.glUniform1f(composite.uniformLocation("uMaskHi"), maskHi)

      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("shader composite pass")

      // Detach + free the output FBO; the texture survives with the VideoFrame.
      GLES30.glFramebufferTexture2D(
        GLES30.GL_FRAMEBUFFER,
        GLES30.GL_COLOR_ATTACHMENT0,
        GLES30.GL_TEXTURE_2D,
        0,
        0,
      )
      GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0)
      GLES30.glDeleteFramebuffers(1, intArrayOf(outputFboHandle), 0)
      outputFboHandle = 0
      GlDebug.check("shader output cleanup")

      // R3: fence this frame and hand the previous GPU-complete frame off; the
      // pipeline now owns outputTextureId, so zero the local handle.
      val ready = pipeline.enqueue(
        outputTextureId,
        width,
        height,
        // Pixels are already display-upright after ingest; emit rotation 0.
        0,
        frame.timestampNs,
        EffectTuning.debugTiming,
        TAG,
      )
      outputTextureId = 0
      ready ?: return null

      val yc = yuvConverter ?: run {
        val c = YuvConverter()
        yuvConverter = c
        c
      }

      val readyTextureId = ready.textureId
      val outputBuffer = TextureBufferImpl(
        ready.width,
        ready.height,
        VideoFrame.TextureBuffer.Type.RGB,
        readyTextureId,
        Matrix(),
        textureHelper.handler,
        yc,
        Runnable {
          GLES30.glDeleteTextures(1, intArrayOf(readyTextureId), 0)
        },
      )

      VideoFrame(outputBuffer, ready.rotation, ready.timestampNs)
    } catch (t: Throwable) {
      if (outputTextureId != 0) {
        try {
          GLES30.glDeleteTextures(1, intArrayOf(outputTextureId), 0)
        } catch (delErr: Throwable) {
          Log.w(TAG, "failed to free orphan texture $outputTextureId", delErr)
        }
      }
      if (outputFboHandle != 0) {
        try {
          GLES30.glDeleteFramebuffers(1, intArrayOf(outputFboHandle), 0)
        } catch (delErr: Throwable) {
          Log.w(TAG, "failed to free orphan FBO $outputFboHandle", delErr)
        }
      }
      throw t
    } finally {
      Egl.restore(saved)
    }
  }

  /**
   * Bind every uniform JS set for this shader, by name. A scalar (length 1)
   * goes through glUniform1f; a vector of length 2/3/4 through the matching
   * glUniformNfv. Locations that resolve to -1 (the shader does not declare
   * that name, or the linker stripped an unused one) are skipped: glUniform* on
   * -1 is a no-op, but skipping avoids the per-frame churn and keeps intent
   * clear. No plasma-specific names appear here.
   */
  private fun bindUniforms(program: GlProgram) {
    val uniforms = ShaderUniforms.get(shaderName) ?: return
    for ((name, values) in uniforms) {
      val loc = program.uniformLocation(name)
      if (loc == -1) continue
      when (values.size) {
        1 -> GLES30.glUniform1f(loc, values[0])
        2 -> GLES30.glUniform2fv(loc, 1, values, 0)
        3 -> GLES30.glUniform3fv(loc, 1, values, 0)
        4 -> GLES30.glUniform4fv(loc, 1, values, 0)
        else -> Log.w(TAG, "uniform '$name' has unsupported length ${values.size}; skipping")
      }
    }
  }

  private fun ensurePrograms() {
    if (oesToTwoD == null) {
      oesToTwoD = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.OES_PASSTHROUGH_FRAG)
      GlDebug.check("oesToTwoD compile/link")
    }
    if (shaderProgram == null) {
      shaderProgram = GlProgram(Shaders.PASSTHROUGH_VERT, fragmentSource)
      GlDebug.check("generative shader '$shaderName' compile/link")
    }
    if (compositeProgram == null) {
      compositeProgram = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.COMPOSITE_FRAG)
      GlDebug.check("composite compile/link")
    }
  }

  private fun ensureIntermediates(width: Int, height: Int) {
    if (cachedWidth == width && cachedHeight == height && originalFbo != null) return
    originalFbo?.delete()
    backgroundFbo?.delete()
    originalFbo = Fbo(width, height)
    backgroundFbo = Fbo(width, height)
    cachedWidth = width
    cachedHeight = height
    GlDebug.check("shader intermediates allocated")
  }

  companion object {
    private const val TAG = "Kaleidoscope.Shader"
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
  }
}

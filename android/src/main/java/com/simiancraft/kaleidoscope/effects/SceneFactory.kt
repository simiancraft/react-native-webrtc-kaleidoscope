// Android scene compositor — GPU pipeline.
//
// The multi-layer generalization of ShaderFactory: a scene is an ordered
// painter's stack of layers (SceneLayers, delivered from JS via setSceneLayers),
// composited into ONE output texture, layer 0 opaque, later layers blended over.
// One factory class serves EVERY scene; the layer stack is data, swapped from JS
// as the active scene changes, so adding a scene needs no Kotlin change.
//
// Per frame (builds on the single-effect factories):
//   1. OES camera -> "camera 2D" FBO (display-upright, via Ingest), as elsewhere.
//   2. If any layer targets the subject, produce the mask via Mask.produce.
//   3. Bind the output FBO, clear to opaque black, then for each layer in order:
//        - 'image'      : cover-fit the plate texture, premultiplied output.
//        - 'direct' + subject : the masked person, premultiplied (mirrors the web
//                         SUBJECT_FRAG). Skipped until a mask has completed.
//        - generative   : render its frag with uTime/uResolution + uniforms.
//      The base layer draws opaque (blend off); later layers use premultiplied
//      "over" (normal) or additive, per the layer's blend.
//   4. Detach + free the output FBO; fence the texture through FramePipeline and
//      hand the previous GPU-complete frame downstream.
//
// Layer kinds the native path supports today: image, direct(subject), and the
// six generative layer shaders + plasma (LayerShaders.GENERATIVE). A generative
// layer on the subject target is skipped (mirrors the web "for now"), as is a
// 'direct' background layer (a no-op there).
//
// All failure paths log under Kaleidoscope.Scene and fall through to null so
// upstream forwards the original frame instead of crashing.

package com.simiancraft.kaleidoscope.effects

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.opengl.GLES30
import android.opengl.GLUtils
import android.util.Log
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessor
import com.oney.WebRTCModule.videoEffects.VideoFrameProcessorFactoryInterface
import com.simiancraft.kaleidoscope.EffectTuning
import com.simiancraft.kaleidoscope.SceneLayer
import com.simiancraft.kaleidoscope.SceneLayers
import com.simiancraft.kaleidoscope.gpu.Egl
import com.simiancraft.kaleidoscope.gpu.Fbo
import com.simiancraft.kaleidoscope.gpu.FramePipeline
import com.simiancraft.kaleidoscope.gpu.GlDebug
import com.simiancraft.kaleidoscope.gpu.GlProgram
import com.simiancraft.kaleidoscope.gpu.Ingest
import com.simiancraft.kaleidoscope.gpu.Shaders
import com.simiancraft.kaleidoscope.segmentation.Mask
import com.simiancraft.kaleidoscope.segmentation.MaskTuning
import org.webrtc.SurfaceTextureHelper
import org.webrtc.TextureBufferImpl
import org.webrtc.VideoFrame
import org.webrtc.YuvConverter

/**
 * @param context held for Mask (segmentation) and to read bundled plate assets.
 *   The scene layer stack itself arrives from JS via SceneLayers, so this
 *   factory carries no per-scene state.
 */
class SceneFactory(
  private val context: Context,
) : VideoFrameProcessorFactoryInterface {
  override fun build(): VideoFrameProcessor = SceneProcessor(context)
}

private class SceneProcessor(
  private val context: Context,
) : VideoFrameProcessor {
  // process() is only ever invoked on the single SurfaceTextureHelper capture
  // thread; this is the same single-threaded marker the other factories use.
  private val lock = Any()

  private var oesToTwoD: GlProgram? = null
  private var imageProgram: GlProgram? = null
  private var subjectProgram: GlProgram? = null
  // Generative layer programs, compiled lazily and cached by shader name.
  private val shaderPrograms = HashMap<String, GlProgram>()

  private var cameraFbo: Fbo? = null
  private var cachedWidth = 0
  private var cachedHeight = 0

  // Plate textures by id, loaded lazily on first use; cached for the session.
  // Each entry carries the source aspect for cover-fit.
  private val plateTextures = HashMap<String, PlateTexture>()
  private val missingPlates = HashSet<String>() // ids whose asset load failed (don't retry per frame)

  private val mask = Mask(context)
  private var yuvConverter: YuvConverter? = null
  private val pipeline = FramePipeline()

  private var startNanos: Long = 0L

  private class PlateTexture(val textureId: Int, val aspect: Float)

  override fun process(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return synchronized(lock) { processOuter(frame, textureHelper) }
  }

  private fun processOuter(frame: VideoFrame, textureHelper: SurfaceTextureHelper?): VideoFrame? {
    return try {
      processInner(frame, textureHelper)
    } catch (t: Throwable) {
      Log.e(
        TAG,
        "process() threw; falling through. " +
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

    val layers = SceneLayers.get()
    if (layers.isEmpty()) {
      // No scene spec delivered yet (or it was cleared). Forward the original.
      return null
    }

    val width = Ingest.displayWidth(bufW, bufH, frame.rotation)
    val height = Ingest.displayHeight(bufW, bufH, frame.rotation)

    GlDebug.check("scene entry")
    val saved = Egl.save()
    var outputTextureId = 0
    var outputFboHandle = 0
    return try {
      ensureCorePrograms()
      ensureIntermediates(width, height)
      if (startNanos == 0L) startNanos = System.nanoTime()

      val camFbo = cameraFbo ?: error("cameraFbo null after ensure")
      val oes = oesToTwoD ?: error("oesToTwoD null after ensure")

      // ===== Pass 1: OES camera -> "camera 2D" (display-upright) =====
      GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
      GLES30.glBindTexture(GL_TEXTURE_EXTERNAL_OES, inputBuffer.textureId)
      camFbo.bind()
      oes.use()
      oes.setInt("uTex", 0)
      val texMatrix = Ingest.composedTexMatrix(inputBuffer.transformMatrix, frame.rotation)
      GLES30.glUniformMatrix4fv(oes.uniformLocation("uTexMatrix"), 1, false, texMatrix, 0)
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)
      GLES30.glDisable(GLES30.GL_BLEND)
      GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
      GlDebug.check("scene OES->2D")

      // ===== Mask (only if a subject layer is present) =====
      val needsSubject = layers.any { it.target == "subject" }
      var maskTexId = -1
      if (needsSubject) {
        maskTexId = mask.produce(camFbo.texture, width, height)
        // maskTexId == -1 means no mask yet; the subject layer is skipped this
        // frame (the rest of the scene still composites).
      }

      // ===== Composite all layers into a fresh output texture =====
      val outputFbo = Fbo(width, height)
      outputTextureId = outputFbo.texture
      outputFboHandle = outputFbo.framebuffer

      outputFbo.bind()
      // Clear to opaque black so a non-covering base or a fully-transparent
      // result is well-defined rather than reading uninitialized memory.
      // Snapshot the clear color (Egl.save does not capture it) and restore it
      // after, so we hand GL state back unperturbed for the next consumer.
      val savedClearColor = FloatArray(4).also { GLES30.glGetFloatv(GLES30.GL_COLOR_CLEAR_VALUE, it, 0) }
      GLES30.glClearColor(0f, 0f, 0f, 1f)
      GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
      GLES30.glClearColor(savedClearColor[0], savedClearColor[1], savedClearColor[2], savedClearColor[3])
      GLES30.glDisable(GLES30.GL_DEPTH_TEST)

      val elapsedSeconds = ((System.nanoTime() - startNanos) / 1e9).toFloat()

      for (i in layers.indices) {
        val layer = layers[i]
        applyBlend(isBase = i == 0, blend = layer.blend)
        drawLayer(layer, width, height, elapsedSeconds, camFbo.texture, maskTexId)
      }
      GlDebug.check("scene composite")

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
      // Leave blend disabled so we hand GL state back near the save() baseline.
      GLES30.glDisable(GLES30.GL_BLEND)
      GlDebug.check("scene output cleanup")

      val ready = pipeline.enqueue(
        outputTextureId,
        width,
        height,
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

  // Set the GL blend state for a layer. The base (layer 0) is opaque (blend off);
  // 'normal' is premultiplied "over"; 'additive' is premultiplied add.
  private fun applyBlend(isBase: Boolean, blend: String?) {
    if (isBase || blend == null || blend == "normal") {
      if (isBase) {
        GLES30.glDisable(GLES30.GL_BLEND)
      } else {
        GLES30.glEnable(GLES30.GL_BLEND)
        GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA)
      }
    } else {
      // additive
      GLES30.glEnable(GLES30.GL_BLEND)
      GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE)
    }
  }

  // Draw one layer into the currently-bound (output) FBO at the current blend.
  private fun drawLayer(
    layer: SceneLayer,
    width: Int,
    height: Int,
    elapsedSeconds: Float,
    cameraTexture: Int,
    maskTexId: Int,
  ) {
    when (layer.shader) {
      "image" -> drawImageLayer(layer, width, height)
      "direct" -> {
        // Passthrough. On the subject that is the masked person; on the
        // background it is a no-op (nothing to pass through but the stack).
        if (layer.target == "subject" && maskTexId != -1) {
          drawSubjectLayer(cameraTexture, maskTexId)
        }
      }
      else -> {
        // A generative layer. Stenciling one to the subject is a later step;
        // for now generative layers run on the background only.
        if (layer.target != "subject") {
          drawGenerativeLayer(layer, width, height, elapsedSeconds)
        }
      }
    }
  }

  private fun drawImageLayer(layer: SceneLayer, width: Int, height: Int) {
    val id = layer.source ?: run {
      Log.w(TAG, "image layer has no source id; skipping")
      return
    }
    val plate = ensurePlateTexture(id) ?: return
    val prog = imageProgram ?: return
    prog.use()
    GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, plate.textureId)
    prog.setInt("uTex", 0)
    val (sx, sy) = coverScale(width, height, plate.aspect)
    prog.setVec2("uCoverScale", sx, sy)
    GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
  }

  private fun drawSubjectLayer(cameraTexture: Int, maskTexId: Int) {
    val prog = subjectProgram ?: return
    prog.use()
    GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, cameraTexture)
    prog.setInt("uCamera", 0)
    GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
    GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTexId)
    prog.setInt("uMask", 1)
    // Android mask is already aligned with the camera FBO (the readback +
    // packMask flip-back round-trip), so identity mask UV, unlike web's V-flip.
    prog.setVec2("uMaskUvScale", 1f, 1f)
    prog.setVec2("uMaskUvOffset", 0f, 0f)
    val (maskLo, maskHi) =
      MaskTuning.smoothstepRange(EffectTuning.maskHardness, EffectTuning.maskThreshold)
    GLES30.glUniform1f(prog.uniformLocation("uMaskLo"), maskLo)
    GLES30.glUniform1f(prog.uniformLocation("uMaskHi"), maskHi)
    GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
  }

  private fun drawGenerativeLayer(
    layer: SceneLayer,
    width: Int,
    height: Int,
    elapsedSeconds: Float,
  ) {
    val prog = ensureGenerativeProgram(layer.shader) ?: return
    prog.use()
    GLES30.glUniform1f(prog.uniformLocation("uTime"), elapsedSeconds)
    GLES30.glUniform2f(prog.uniformLocation("uResolution"), width.toFloat(), height.toFloat())
    for ((name, values) in layer.uniforms) {
      val loc = prog.uniformLocation(name)
      if (loc == -1) continue
      when (values.size) {
        1 -> GLES30.glUniform1f(loc, values[0])
        2 -> GLES30.glUniform2fv(loc, 1, values, 0)
        3 -> GLES30.glUniform3fv(loc, 1, values, 0)
        4 -> GLES30.glUniform4fv(loc, 1, values, 0)
        else -> Log.w(TAG, "uniform '$name' has unsupported length ${values.size}; skipping")
      }
    }
    GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
  }

  // Center-crop cover-fit UV scale: zoom in on the dimension that would otherwise
  // letterbox. Mirrors coverScale() in scene.ts (output vs image aspect).
  private fun coverScale(outW: Int, outH: Int, imgAspect: Float): Pair<Float, Float> {
    val outAspect = outW.toFloat() / outH.toFloat()
    return if (outAspect > imgAspect) {
      1f to (imgAspect / outAspect)
    } else {
      (outAspect / imgAspect) to 1f
    }
  }

  private fun ensureCorePrograms() {
    if (oesToTwoD == null) {
      oesToTwoD = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.OES_PASSTHROUGH_FRAG)
      GlDebug.check("scene oesToTwoD compile/link")
    }
    if (imageProgram == null) {
      imageProgram = GlProgram(Shaders.PASSTHROUGH_VERT, LayerShaders.IMAGE_FRAG)
      GlDebug.check("scene image program compile/link")
    }
    if (subjectProgram == null) {
      subjectProgram = GlProgram(Shaders.PASSTHROUGH_VERT, LayerShaders.SUBJECT_FRAG)
      GlDebug.check("scene subject program compile/link")
    }
  }

  private fun ensureGenerativeProgram(shaderName: String): GlProgram? {
    shaderPrograms[shaderName]?.let { return it }
    val src = LayerShaders.GENERATIVE[shaderName]
    if (src == null) {
      Log.w(TAG, "unknown generative layer shader '$shaderName'; skipping")
      return null
    }
    val prog = GlProgram(Shaders.PASSTHROUGH_VERT, src)
    GlDebug.check("scene generative '$shaderName' compile/link")
    shaderPrograms[shaderName] = prog
    return prog
  }

  private fun ensureIntermediates(width: Int, height: Int) {
    if (cachedWidth == width && cachedHeight == height && cameraFbo != null) return
    cameraFbo?.delete()
    cameraFbo = Fbo(width, height)
    cachedWidth = width
    cachedHeight = height
    GlDebug.check("scene intermediates allocated")
  }

  // Load a scene plate WebP from assets/scene-plates/<id>.webp, pre-flipped (the
  // shared semantic-top-at-v=1 convention; mirrors BackgroundImageFactory). Cached
  // per id; a failed load is remembered so we don't re-read every frame.
  private fun ensurePlateTexture(id: String): PlateTexture? {
    plateTextures[id]?.let { return it }
    if (missingPlates.contains(id)) return null
    val bmp = try {
      context.assets.open("$PLATES_DIR/$id.webp").use { BitmapFactory.decodeStream(it) }
    } catch (t: Throwable) {
      Log.e(TAG, "failed to load scene plate $PLATES_DIR/$id.webp", t)
      missingPlates.add(id)
      return null
    }
    if (bmp == null) {
      Log.e(TAG, "BitmapFactory returned null for $PLATES_DIR/$id.webp")
      missingPlates.add(id)
      return null
    }
    val flipMatrix = Matrix().apply { preScale(1f, -1f) }
    val flipped = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, flipMatrix, false)
    try {
      val ids = IntArray(1)
      GLES30.glGenTextures(1, ids, 0)
      val texId = ids[0]
      GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texId)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
      GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
      GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, flipped, 0)
      GlDebug.check("scene plate '$id' upload")
      val aspect = bmp.width.toFloat() / bmp.height.toFloat()
      Log.i(TAG, "scene plate '$id' loaded; size=${bmp.width}x${bmp.height} aspect=$aspect")
      val plate = PlateTexture(texId, aspect)
      plateTextures[id] = plate
      return plate
    } finally {
      flipped.recycle()
      bmp.recycle()
    }
  }

  companion object {
    private const val TAG = "Kaleidoscope.Scene"
    private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
    private const val PLATES_DIR = "scene-plates"
  }
}

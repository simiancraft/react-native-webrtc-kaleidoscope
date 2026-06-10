// Android composite compositor; GPU pipeline.
//
// The multi-layer generalization of ShaderFactory: a composite is an ordered
// painter's stack of layers (CompositeLayers, delivered from JS via
// setCompositeLayers), composited into ONE output texture, layer 0 opaque, later
// layers blended over. One factory class serves EVERY composite; the layer stack
// is data, swapped from JS as the active composite changes, so adding a composite
// needs no Kotlin change.
//
// Per frame (builds on the single-effect factories):
//   1. OES camera -> "camera 2D" FBO (display-upright, via Ingest), as elsewhere.
//   2. If any layer targets the subject, produce the mask via Mask.produce.
//   3. Bind the output FBO, clear to opaque black, then for each layer in order:
//        - 'image'            : cover-fit the image texture, premultiplied output.
//        - 'direct'+background : the raw camera fullscreen, opaque.
//        - 'direct'+subject   : the masked person, premultiplied (one-pass fast
//                         path). Skipped until a mask has completed.
//        - 'blur'             : a camera-sampling separable gaussian (its `sigma`
//                         uniform), two passes through the scratch ping-pong.
//        - generative         : render its frag with uTime/uResolution + uniforms.
//      Any subject-targeted layer that is not 'direct' renders to a scratch FBO,
//      then a masked-composite pass multiplies it by the mask alpha. The base
//      layer draws opaque (blend off); later layers use premultiplied "over"
//      (normal) or additive, per the layer's blend.
//   4. Detach + free the output FBO; fence the texture through FramePipeline and
//      hand the previous GPU-complete frame downstream.
//
// This is the one art compositor (registered "composite"); blur, background
// images, and generative shaders are all layers here, folding the former
// BlurFactory / BackgroundImageFactory / ShaderFactory into the layer stack.
//
// All failure paths log under Kaleidoscope.Composite and fall through to null so
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
import com.simiancraft.kaleidoscope.CompositeLayer
import com.simiancraft.kaleidoscope.CompositeLayers
import com.simiancraft.kaleidoscope.EffectTuning
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
 * @param context held for Mask (segmentation) and to read bundled image assets.
 *   The composite layer stack itself arrives from JS via CompositeLayers, so this
 *   factory carries no per-composite state.
 */
class CompositeFactory(
    private val context: Context,
) : VideoFrameProcessorFactoryInterface {
    override fun build(): VideoFrameProcessor = CompositeProcessor(context)
}

private class CompositeProcessor(
    private val context: Context,
) : VideoFrameProcessor {
    // process() is only ever invoked on the single SurfaceTextureHelper capture
    // thread; this is the same single-threaded marker the other factories use.
    private val lock = Any()

    private var oesToTwoD: GlProgram? = null
    private var imageProgram: GlProgram? = null
    private var subjectProgram: GlProgram? = null
    private var cameraProgram: GlProgram? = null // direct/background: raw camera fullscreen
    private var blurProgram: GlProgram? = null // camera-sampling separable gaussian
    private var maskedProgram: GlProgram? = null // stencil a scratch layer to the subject

    // Generative layer programs, compiled lazily and cached by shader name.
    private val shaderPrograms = HashMap<String, GlProgram>()

    private var cameraFbo: Fbo? = null

    // Scratch render targets, mirroring composite.ts: scratchA holds a subject
    // layer's rendered content (and the blur's horizontal pass); scratchB holds the
    // blur's vertical pass. Allocated alongside the camera FBO, reused across frames.
    private var scratchA: Fbo? = null
    private var scratchB: Fbo? = null
    private var cachedWidth = 0
    private var cachedHeight = 0

    // Image textures by id, loaded lazily on first use; cached for the session.
    // Each entry carries the source aspect for cover-fit.
    private val imageTextures = HashMap<String, ImageTexture>()
    private val missingImages = HashSet<String>() // ids whose asset load failed (don't retry per frame)

    private val mask = Mask(context)
    private var yuvConverter: YuvConverter? = null
    private val pipeline = FramePipeline()

    private var startNanos: Long = 0L

    private class ImageTexture(
        val textureId: Int,
        val aspect: Float,
    )

    override fun process(
        frame: VideoFrame,
        textureHelper: SurfaceTextureHelper?,
    ): VideoFrame? =
        synchronized(lock) {
            processOuter(frame, textureHelper)
        }

    private fun processOuter(
        frame: VideoFrame,
        textureHelper: SurfaceTextureHelper?,
    ): VideoFrame? =
        try {
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
            Log.w(TAG, "Degenerate dims ${bufW}x$bufH; forwarding.")
            return null
        }

        val layers = CompositeLayers.get()
        if (layers.isEmpty()) {
            // No composite spec delivered yet (or it was cleared). Forward the original.
            return null
        }

        val width = Ingest.displayWidth(bufW, bufH, frame.rotation)
        val height = Ingest.displayHeight(bufW, bufH, frame.rotation)

        GlDebug.check("composite entry")
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
            GlDebug.check("composite OES->2D")

            // ===== Mask (only if a subject layer is present) =====
            val needsSubject = layers.any { it.target == "subject" }
            var maskTexId = -1
            if (needsSubject) {
                maskTexId = mask.produce(camFbo.texture, width, height)
                // maskTexId == -1 means no mask yet; the subject layer is skipped this
                // frame (the rest of the composite still composites).
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
                drawLayer(
                    layer,
                    isBase = i == 0,
                    width,
                    height,
                    elapsedSeconds,
                    camFbo.texture,
                    maskTexId,
                    outputFbo,
                )
            }
            GlDebug.check("composite layers")

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
            GlDebug.check("composite output cleanup")

            val ready =
                pipeline.enqueue(
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

            val yc =
                yuvConverter ?: run {
                    val c = YuvConverter()
                    yuvConverter = c
                    c
                }

            val readyTextureId = ready.textureId
            val outputBuffer =
                TextureBufferImpl(
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

    // Bind the output FBO and set the GL blend state for a layer's output draw,
    // mirroring composite.ts setOutputBlend(). The base (layer 0) is opaque (blend off);
    // 'normal' is premultiplied "over"; 'additive' is premultiplied add.
    private fun bindOutputBlend(
        outputFbo: Fbo,
        isBase: Boolean,
        blend: String?,
    ) {
        outputFbo.bind()
        GLES30.glDisable(GLES30.GL_DEPTH_TEST)
        if (isBase) {
            GLES30.glDisable(GLES30.GL_BLEND)
        } else if (blend == "additive") {
            GLES30.glEnable(GLES30.GL_BLEND)
            GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE) // premultiplied additive
        } else {
            GLES30.glEnable(GLES30.GL_BLEND)
            GLES30.glBlendFunc(GLES30.GL_ONE, GLES30.GL_ONE_MINUS_SRC_ALPHA) // premultiplied "over"
        }
    }

    // Composite one layer onto the output. Mirrors the per-layer body of composite.ts:
    // a 'subject' layer is mask-stenciled (direct takes the one-pass cam x mask fast
    // path; any other shader renders to a scratch then a masked-composite multiplies
    // by the mask alpha), a 'background' layer draws fullscreen (image cover-fit,
    // direct raw camera, blur the two-pass gaussian, generative its frag). The layer
    // owns its FBO binds: subject/blur layers render content into a scratch first,
    // then bindOutputBlend() before the final output draw.
    private fun drawLayer(
        layer: CompositeLayer,
        isBase: Boolean,
        width: Int,
        height: Int,
        elapsedSeconds: Float,
        cameraTexture: Int,
        maskTexId: Int,
        outputFbo: Fbo,
    ) {
        val target = layer.target

        if (target == "subject") {
            // Subject layers need the mask; skip until it warms up (mirrors web's
            // subjectReady guard).
            if (maskTexId == -1) return
            if (layer.shader == "direct") {
                // One-pass fast path: cam x mask.
                bindOutputBlend(outputFbo, isBase, layer.blend)
                drawSubjectLayer(cameraTexture, maskTexId)
                return
            }
            // Render the layer's content to a scratch, then stencil it through the mask.
            val contentTex =
                renderContentToScratch(layer, width, height, elapsedSeconds, cameraTexture)
                    ?: return
            bindOutputBlend(outputFbo, isBase, layer.blend)
            drawMaskedComposite(contentTex, maskTexId)
            return
        }

        // Background layers draw fullscreen.
        when (layer.shader) {
            "image" -> {
                bindOutputBlend(outputFbo, isBase, layer.blend)
                drawImageLayer(layer, width, height)
            }
            "direct" -> {
                // Raw camera fullscreen.
                bindOutputBlend(outputFbo, isBase, layer.blend)
                drawCameraLayer(cameraTexture)
            }
            "blur" -> {
                val contentTex =
                    renderContentToScratch(layer, width, height, elapsedSeconds, cameraTexture)
                        ?: return
                bindOutputBlend(outputFbo, isBase, layer.blend)
                drawBlit(contentTex)
            }
            else -> {
                bindOutputBlend(outputFbo, isBase, layer.blend)
                drawGenerativeLayer(layer, width, height, elapsedSeconds)
            }
        }
    }

    // Render a layer's content into a scratch FBO (blend off, cleared), returning the
    // texture that holds it. Blur is special: it runs the separable passes (camera ->
    // scratchA -> scratchB) and returns scratchB. Mirrors renderContentToScratch in
    // composite.ts. The caller re-binds the output FBO before the final composite.
    private fun renderContentToScratch(
        layer: CompositeLayer,
        width: Int,
        height: Int,
        elapsedSeconds: Float,
        cameraTexture: Int,
    ): Int? {
        GLES30.glDisable(GLES30.GL_BLEND)
        if (layer.shader == "blur") {
            val a = scratchA ?: return null
            val b = scratchB ?: return null
            val prog = blurProgram ?: return null
            val sigma = layer.uniforms["sigma"]?.firstOrNull() ?: 4f
            prog.use()
            GLES30.glUniform1f(prog.uniformLocation("uSigma"), sigma)
            // Horizontal pass: camera -> scratchA.
            a.bind()
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, cameraTexture)
            prog.setInt("uTex", 0)
            prog.setVec2("uDir", 1f / width, 0f)
            GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
            // Vertical pass: scratchA -> scratchB.
            b.bind()
            GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, a.texture)
            prog.setInt("uTex", 0)
            prog.setVec2("uDir", 0f, 1f / height)
            GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
            return b.texture
        }
        val a = scratchA ?: return null
        a.bind()
        GLES30.glClearColor(0f, 0f, 0f, 0f)
        GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT)
        if (layer.shader == "image") {
            if (!drawImageLayer(layer, width, height)) return null
            return a.texture
        }
        // Generative.
        if (!drawGenerativeLayer(layer, width, height, elapsedSeconds)) return null
        return a.texture
    }

    // Cover-fit an image into the bound FBO. Returns false if the image or program
    // is unavailable so the caller can skip the layer.
    private fun drawImageLayer(
        layer: CompositeLayer,
        width: Int,
        height: Int,
    ): Boolean {
        val id =
            layer.source ?: run {
                Log.w(TAG, "image layer has no source id; skipping")
                return false
            }
        val image = ensureImageTexture(id) ?: return false
        val prog = imageProgram ?: return false
        prog.use()
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, image.textureId)
        prog.setInt("uTex", 0)
        val (sx, sy) = coverScale(width, height, image.aspect)
        prog.setVec2("uCoverScale", sx, sy)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        return true
    }

    // Raw camera fullscreen (direct/background), opaque.
    private fun drawCameraLayer(cameraTexture: Int) {
        val prog = cameraProgram ?: return
        prog.use()
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, cameraTexture)
        prog.setInt("uCamera", 0)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
    }

    // Blit a finished scratch texture (premultiplied, cover scale 1,1) to the bound
    // output FBO. Used for a blur/background layer, mirroring composite.ts's blit draw.
    private fun drawBlit(texture: Int) {
        val prog = imageProgram ?: return
        prog.use()
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, texture)
        prog.setInt("uTex", 0)
        prog.setVec2("uCoverScale", 1f, 1f)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
    }

    private fun drawSubjectLayer(
        cameraTexture: Int,
        maskTexId: Int,
    ) {
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

    // Stencil a rendered scratch (premultiplied) to the subject by multiplying
    // through the mask alpha. Mirrors the masked-composite pass in composite.ts; the
    // output stays premultiplied so the caller's blend composites it correctly.
    private fun drawMaskedComposite(
        contentTexture: Int,
        maskTexId: Int,
    ) {
        val prog = maskedProgram ?: return
        prog.use()
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, contentTexture)
        prog.setInt("uTex", 0)
        GLES30.glActiveTexture(GLES30.GL_TEXTURE1)
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, maskTexId)
        prog.setInt("uMask", 1)
        prog.setVec2("uMaskUvScale", 1f, 1f)
        prog.setVec2("uMaskUvOffset", 0f, 0f)
        val (maskLo, maskHi) =
            MaskTuning.smoothstepRange(EffectTuning.maskHardness, EffectTuning.maskThreshold)
        GLES30.glUniform1f(prog.uniformLocation("uMaskLo"), maskLo)
        GLES30.glUniform1f(prog.uniformLocation("uMaskHi"), maskHi)
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
    }

    // Render a generative frag into the bound FBO. Returns false if its program is
    // unavailable (unknown shader) so the caller can skip the layer.
    private fun drawGenerativeLayer(
        layer: CompositeLayer,
        width: Int,
        height: Int,
        elapsedSeconds: Float,
    ): Boolean {
        val prog = ensureGenerativeProgram(layer.shader) ?: return false
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
                // An even length > 4 is a vec2 array (a polygon: flat [x0,y0, ...]).
                else ->
                    if (values.size % 2 == 0) {
                        GLES30.glUniform2fv(loc, values.size / 2, values, 0)
                    } else {
                        Log.w(TAG, "uniform '$name' has unsupported length ${values.size}; skipping")
                    }
            }
        }
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4)
        return true
    }

    // Center-crop cover-fit UV scale: zoom in on the dimension that would otherwise
    // letterbox. Mirrors coverScale() in composite.ts (output vs image aspect).
    private fun coverScale(
        outW: Int,
        outH: Int,
        imgAspect: Float,
    ): Pair<Float, Float> {
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
            GlDebug.check("composite oesToTwoD compile/link")
        }
        if (imageProgram == null) {
            imageProgram = GlProgram(Shaders.PASSTHROUGH_VERT, LayerShaders.IMAGE_FRAG)
            GlDebug.check("composite image program compile/link")
        }
        if (subjectProgram == null) {
            subjectProgram = GlProgram(Shaders.PASSTHROUGH_VERT, LayerShaders.SUBJECT_FRAG)
            GlDebug.check("composite subject program compile/link")
        }
        if (cameraProgram == null) {
            cameraProgram = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.COMPOSITE_CAMERA_FRAG)
            GlDebug.check("composite camera program compile/link")
        }
        if (blurProgram == null) {
            blurProgram = GlProgram(Shaders.PASSTHROUGH_VERT, Shaders.COMPOSITE_BLUR_FRAG)
            GlDebug.check("composite blur program compile/link")
        }
        if (maskedProgram == null) {
            maskedProgram = GlProgram(Shaders.PASSTHROUGH_VERT, LayerShaders.MASKED_FRAG)
            GlDebug.check("composite masked program compile/link")
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
        GlDebug.check("composite generative '$shaderName' compile/link")
        shaderPrograms[shaderName] = prog
        return prog
    }

    private fun ensureIntermediates(
        width: Int,
        height: Int,
    ) {
        if (cachedWidth == width && cachedHeight == height && cameraFbo != null) return
        cameraFbo?.delete()
        scratchA?.delete()
        scratchB?.delete()
        cameraFbo = Fbo(width, height)
        // Two scratch targets sized to the frame: the subject-stencil scratch and the
        // blur ping-pong (scratchA horizontal, scratchB vertical). Full-res to mirror
        // composite.ts; the old BlurFactory downscale is dropped for parity.
        scratchA = Fbo(width, height)
        scratchB = Fbo(width, height)
        cachedWidth = width
        cachedHeight = height
        GlDebug.check("composite intermediates allocated")
    }

    // Load a composite image WebP from assets/images/<id>.webp, pre-flipped (the
    // shared semantic-top-at-v=1 convention). Cached
    // per id; a failed load is remembered so we don't re-read every frame.
    private fun ensureImageTexture(id: String): ImageTexture? {
        imageTextures[id]?.let { return it }
        if (missingImages.contains(id)) return null
        val bmp =
            try {
                context.assets.open("$IMAGES_DIR/$id.webp").use { BitmapFactory.decodeStream(it) }
            } catch (t: Throwable) {
                Log.e(TAG, "failed to load composite image $IMAGES_DIR/$id.webp", t)
                missingImages.add(id)
                return null
            }
        if (bmp == null) {
            Log.e(TAG, "BitmapFactory returned null for $IMAGES_DIR/$id.webp")
            missingImages.add(id)
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
            GlDebug.check("composite image '$id' upload")
            val aspect = bmp.width.toFloat() / bmp.height.toFloat()
            Log.i(TAG, "composite image '$id' loaded; size=${bmp.width}x${bmp.height} aspect=$aspect")
            val image = ImageTexture(texId, aspect)
            imageTextures[id] = image
            return image
        } finally {
            flipped.recycle()
            bmp.recycle()
        }
    }

    companion object {
        private const val TAG = "Kaleidoscope.Composite"
        private const val GL_TEXTURE_EXTERNAL_OES = 0x8D65
        private const val IMAGES_DIR = "images"
    }
}

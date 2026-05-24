// One-frame GPU pipeline + fence handoff, shared by all GLES effect factories.
//
// THE PROBLEM IT SOLVES (R3 frame-pipelining):
// The effect factories used to call glFinish() at the end of process(),
// a full CPU<->GPU sync that blocks the capture thread until every draw call
// for THIS frame has completed on the GPU, serializing CPU and GPU. At 720p
// with a multi-pass blur that stall is the dominant cost on the capture
// thread.
//
// THE FIX:
// Defer the handoff by exactly one frame. Each process() call:
//   1. Renders frame N into a fresh output texture (caller's job).
//   2. Hands that texture + a GL fence to enqueue().
//   3. enqueue() returns frame N-1's texture, whose fence it first waits on.
//      Because frame N-1's GPU work had a whole frame interval to finish, the
//      wait is almost always a no-op (GL_ALREADY_SIGNALED); the capture thread
//      no longer blocks on the just-submitted frame's GPU work.
// The very first frame has no predecessor, so enqueue() returns null and the
// caller forwards the original frame for exactly one frame.
//
// One frame of latency is acceptable for this use case (matches the existing
// one-frame latency on mask updates; see Mask.kt).
//
// FENCE LIFECYCLE:
// One fence per in-flight frame. At steady state the pipeline holds exactly
// one PendingFrame (one texture, one fence). enqueue() waits on and deletes
// the predecessor's fence, then stores the successor's. dispose() drains the
// last pending frame (deleting its texture + fence) for processors that ever
// get a teardown hook.
//
// glFenceSync / glClientWaitSync / glDeleteSync and the GL_SYNC_* /
// GL_ALREADY_SIGNALED / GL_CONDITION_SATISFIED constants are all core GLES 3.0
// (android.opengl.GLES30), so this needs no extension probing.

package com.simiancraft.kaleidoscope.gpu

import android.opengl.GLES30
import android.util.Log

internal class FramePipeline {
  /**
   * A rendered-but-not-yet-handed-off output texture and the fence that
   * signals when its GPU work has completed. The caller has already detached
   * and freed the FBO; only the color texture survives here.
   */
  private class PendingFrame(
    val textureId: Int,
    val width: Int,
    val height: Int,
    val rotation: Int,
    val timestampNs: Long,
    val fence: Long,
    // Wall-clock at the moment this frame's GPU work was submitted (the
    // enqueue() call that fenced it). Used only when debug timing is on, to
    // report GPU-completion latency a frame late without adding a blocking
    // wait of its own.
    val submitNanos: Long,
  )

  private var pending: PendingFrame? = null

  /**
   * Insert a sync fence into the GL command stream right after the caller's
   * final draw, then enqueue the freshly rendered texture and return the
   * PREVIOUS frame's texture (now GPU-complete) for handoff downstream.
   *
   * Must be called on the GL thread after the output FBO has been detached
   * and deleted (so only `textureId` remains live).
   *
   * @return a [Ready] describing the previous frame to wrap in a
   *   TextureBufferImpl, or null on the first frame (caller forwards original).
   */
  fun enqueue(
    textureId: Int,
    width: Int,
    height: Int,
    rotation: Int,
    timestampNs: Long,
    debugTiming: Boolean = false,
    timingLabel: String = "",
  ): Ready? {
    // Fence the current frame's GPU work. glFlush guarantees the fence is
    // actually in the command queue so a later glClientWaitSync without the
    // flush-commands bit can still observe it.
    val fence = GLES30.glFenceSync(GLES30.GL_SYNC_GPU_COMMANDS_COMPLETE, 0)
    GLES30.glFlush()

    val submitNanos = if (debugTiming) System.nanoTime() else 0L
    val prev = pending
    pending = PendingFrame(textureId, width, height, rotation, timestampNs, fence, submitNanos)

    if (prev == null) return null

    // Wait on the PREVIOUS frame's fence. It has had a full frame interval to
    // complete, so this is almost always GL_ALREADY_SIGNALED. The timeout is a
    // backstop against a stalled GPU; we still hand the texture off afterward
    // because the consumer's EGL context shares ours and would otherwise read
    // a torn texture. Pass the flush-commands bit defensively in case the
    // predecessor's flush has not yet been issued on this context.
    val waitResult = GLES30.glClientWaitSync(
      prev.fence,
      GLES30.GL_SYNC_FLUSH_COMMANDS_BIT,
      FENCE_TIMEOUT_NS,
    )
    if (waitResult == GLES30.GL_TIMEOUT_EXPIRED || waitResult == GLES30.GL_WAIT_FAILED) {
      Log.w(TAG, "fence wait returned 0x${waitResult.toString(16)}; handing off anyway")
    }
    GLES30.glDeleteSync(prev.fence)

    if (debugTiming && prev.submitNanos != 0L) {
      // CPU-observed latency from the predecessor's GPU submit to the point
      // its fence resolved (now). EXT_disjoint_timer_query (GL_TIME_ELAPSED_EXT
      // + glGetQueryObjectui64v) has no android.opengl Java binding, so this
      // wall-clock delta is the fallback; it measures submit->complete latency
      // rather than pure on-GPU time, but reads a frame late exactly as a timer
      // query would and adds no extra blocking wait.
      val elapsedMs = (System.nanoTime() - prev.submitNanos) / 1_000_000.0
      Log.d(PERF_TAG, "$timingLabel gpu submit->complete ~%.2f ms (nanoTime fallback)".format(elapsedMs))
    }

    return Ready(prev.textureId, prev.width, prev.height, prev.rotation, prev.timestampNs)
  }

  /**
   * Free the last un-handed-off frame's texture and fence. Call on the GL
   * thread from a processor teardown path. (No VideoFrameProcessor teardown
   * hook exists today, mirroring Mask.release; provided for correctness.)
   */
  fun dispose() {
    val p = pending ?: return
    pending = null
    try {
      GLES30.glDeleteSync(p.fence)
      GLES30.glDeleteTextures(1, intArrayOf(p.textureId), 0)
    } catch (t: Throwable) {
      Log.w(TAG, "dispose encountered an error; resources may leak", t)
    }
  }

  /** The previous frame's texture + metadata, ready to wrap downstream. */
  class Ready(
    val textureId: Int,
    val width: Int,
    val height: Int,
    val rotation: Int,
    val timestampNs: Long,
  )

  companion object {
    private const val TAG = "Kaleidoscope.Pipeline"
    private const val PERF_TAG = "Perf"

    // 2 ms. A signaled fence returns immediately; this only bounds the
    // pathological case where the predecessor's GPU work has not finished a
    // full frame later. glClientWaitSync takes nanoseconds.
    private const val FENCE_TIMEOUT_NS = 2_000_000L
  }
}

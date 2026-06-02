package com.simiancraft.kaleidoscope

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for the composite layer-stack wire contract: the JSON that
 * serializeCompositeLayers (src/index.ts) sends across the bridge and that
 * CompositeLayers.set/get/clear parses into the snapshot the compositor reads each
 * frame. These pin the parse rules the iOS CompositeLayers.swift port must match;
 * the same cases are mirrored in the iOS XCTest suite, so a divergence in either
 * parser fails on one side.
 *
 * Runs as a JVM unit test (testDebugUnitTest): the real org.json is on the test
 * classpath and android.util.Log is a no-op stub (unitTests.returnDefaultValues).
 */
class CompositeLayersTest {
  // CompositeLayers is a process-global singleton; reset between cases so a prior
  // set() can't leak into the next assertion.
  @Before
  fun reset() = CompositeLayers.clear()

  // The wizard-tower composite exactly as serializeCompositeLayers emits it: a
  // generative base (clouds, uniforms), the cut-out image (image, source = the
  // stable image id), then you (direct, subject). The canonical happy path.
  @Test
  fun parsesWizardTowerStack() {
    CompositeLayers.set(
      """
      [
        {"id":"sky","shader":"clouds","target":"background","uniforms":{"uExposure":1.26,"uSkyLowColor":[0.99,0.62,0.03],"uCloudSpeed":0.92}},
        {"id":"tower","shader":"image","target":"background","source":"wizards-tower"},
        {"id":"you","shader":"direct","target":"subject"}
      ]
      """.trimIndent(),
    )
    val layers = CompositeLayers.get()
    assertEquals(3, layers.size)

    val clouds = layers[0]
    assertEquals("sky", clouds.id)
    assertEquals("clouds", clouds.shader)
    assertEquals("background", clouds.target)
    assertNull(clouds.blend)
    assertNull(clouds.source)
    assertArrayEquals(floatArrayOf(1.26f), clouds.uniforms["uExposure"], EPS)
    assertArrayEquals(floatArrayOf(0.99f, 0.62f, 0.03f), clouds.uniforms["uSkyLowColor"], EPS)

    val image = layers[1]
    assertEquals("tower", image.id)
    assertEquals("image", image.shader)
    assertEquals("wizards-tower", image.source)
    assertTrue(image.uniforms.isEmpty())

    val you = layers[2]
    assertEquals("you", you.id)
    assertEquals("direct", you.shader)
    assertEquals("subject", you.target)
    assertNull(you.source)
  }

  // An overlay layer carries a blend mode; additive must round-trip, and the
  // base layer (no blend key) must stay null (the compositor reads null = opaque).
  @Test
  fun parsesAdditiveBlendOverOpaqueBase() {
    CompositeLayers.set(
      """
      [
        {"id":"image","shader":"image","target":"background","source":"stylized-dark"},
        {"id":"rays","shader":"godrays","target":"background","blend":"additive","uniforms":{"uRayCount":11}}
      ]
      """.trimIndent(),
    )
    val layers = CompositeLayers.get()
    assertEquals(2, layers.size)
    assertEquals("image", layers[0].id)
    assertNull(layers[0].blend)
    assertEquals("rays", layers[1].id)
    assertEquals("additive", layers[1].blend)
    assertArrayEquals(floatArrayOf(11f), layers[1].uniforms["uRayCount"], EPS)
  }

  // `id` is always on the wire now; a payload missing it falls back to the array
  // index so the address stays stable and unique-per-stack rather than colliding.
  @Test
  fun fallsBackToIndexWhenIdMissing() {
    CompositeLayers.set(
      """[{"shader":"clouds","uniforms":{}},{"shader":"direct","target":"subject"}]""",
    )
    val layers = CompositeLayers.get()
    assertEquals(2, layers.size)
    assertEquals("0", layers[0].id)
    assertEquals("1", layers[1].id)
  }

  // target defaults to "background" when the wire omits it.
  @Test
  fun defaultsMissingTargetToBackground() {
    CompositeLayers.set("""[{"shader":"clouds","uniforms":{}}]""")
    assertEquals("background", CompositeLayers.get()[0].target)
  }

  // A scalar uniform normalizes to a one-element array; a numeric array stays a
  // vector, in order.
  @Test
  fun normalizesScalarAndVectorUniforms() {
    CompositeLayers.set("""[{"shader":"plasma","uniforms":{"speed":0.3,"colorA":[0.0,0.3,0.6]}}]""")
    val u = CompositeLayers.get()[0].uniforms
    assertArrayEquals(floatArrayOf(0.3f), u["speed"], EPS)
    assertArrayEquals(floatArrayOf(0.0f, 0.3f, 0.6f), u["colorA"], EPS)
  }

  // A uniform whose value is neither a number nor a numeric array is skipped;
  // the shader keeps its GLSL default for that name. Well-formed siblings stay.
  @Test
  fun skipsNonNumericUniformKeepingSiblings() {
    CompositeLayers.set("""[{"shader":"plasma","uniforms":{"speed":0.3,"bad":"nope"}}]""")
    val u = CompositeLayers.get()[0].uniforms
    assertArrayEquals(floatArrayOf(0.3f), u["speed"], EPS)
    assertNull(u["bad"])
  }

  // A layer with no shader is skipped; well-formed siblings survive (the parse
  // is per-layer lenient, not all-or-nothing).
  @Test
  fun skipsLayerWithoutShader() {
    CompositeLayers.set("""[{"target":"background"},{"shader":"direct","target":"subject"}]""")
    val layers = CompositeLayers.get()
    assertEquals(1, layers.size)
    assertEquals("direct", layers[0].shader)
  }

  @Test
  fun parsesEmptyStack() {
    CompositeLayers.set("[]")
    assertTrue(CompositeLayers.get().isEmpty())
  }

  // A whole-payload parse failure (not a JSON array) leaves the previous composite
  // in place rather than blanking the frame.
  @Test
  fun keepsPreviousCompositeOnMalformedPayload() {
    CompositeLayers.set("""[{"shader":"direct","target":"subject"}]""")
    CompositeLayers.set("not json at all")
    val layers = CompositeLayers.get()
    assertEquals(1, layers.size)
    assertEquals("direct", layers[0].shader)
  }

  // clear() drops the active composite (a non-composite effect taking over).
  @Test
  fun clearEmptiesStack() {
    CompositeLayers.set("""[{"shader":"direct","target":"subject"}]""")
    CompositeLayers.clear()
    assertTrue(CompositeLayers.get().isEmpty())
  }

  private companion object {
    const val EPS = 1e-6f
  }
}

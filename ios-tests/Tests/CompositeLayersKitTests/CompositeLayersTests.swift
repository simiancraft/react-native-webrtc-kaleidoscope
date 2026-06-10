import XCTest

@testable import CompositeLayersKit

/// Unit tests for the composite layer-stack wire contract on iOS: the JSON that
/// serializeCompositeLayers (src/index.ts) sends across the bridge and that
/// CompositeLayers.set/get/clear parses into the snapshot the compositor reads each
/// frame. These mirror, case for case, android/.../CompositeLayersTest.kt, so a
/// divergence in either parser fails on one side. The wire shape and the rules
/// (target default, scalar/vector uniform normalization, lenient per-layer skip,
/// keep-previous on a whole-payload failure) are the shared contract; the two
/// implementations are different languages but MUST agree here.
final class CompositeLayersTests: XCTestCase {
  // CompositeLayers is a process-global singleton; reset between cases so a prior
  // set() can't leak into the next assertion.
  override func setUp() {
    super.setUp()
    CompositeLayers.clear()
  }

  // The wizard-tower composite exactly as serializeCompositeLayers emits it: a
  // generative base (clouds, uniforms), the cut-out plate (image, source = the
  // stable plate id), then you (direct, subject). The canonical happy path.
  func testParsesWizardTowerStack() {
    CompositeLayers.set(
      """
      [
        {"id":"sky","shader":"clouds","target":"background","uniforms":{"uExposure":1.26,"uSkyLowColor":[0.99,0.62,0.03],"uCloudSpeed":0.92}},
        {"id":"tower","shader":"image","target":"background","source":"wizards-tower"},
        {"id":"you","shader":"direct","target":"subject"}
      ]
      """
    )
    let layers = CompositeLayers.get()
    XCTAssertEqual(layers.count, 3)

    let clouds = layers[0]
    XCTAssertEqual(clouds.id, "sky")
    XCTAssertEqual(clouds.shader, "clouds")
    XCTAssertEqual(clouds.target, "background")
    XCTAssertNil(clouds.blend)
    XCTAssertNil(clouds.source)
    assertFloats(clouds.uniforms["uExposure"], [1.26])
    assertFloats(clouds.uniforms["uSkyLowColor"], [0.99, 0.62, 0.03])

    let plate = layers[1]
    XCTAssertEqual(plate.id, "tower")
    XCTAssertEqual(plate.shader, "image")
    XCTAssertEqual(plate.source, "wizards-tower")
    XCTAssertTrue(plate.uniforms.isEmpty)

    let you = layers[2]
    XCTAssertEqual(you.id, "you")
    XCTAssertEqual(you.shader, "direct")
    XCTAssertEqual(you.target, "subject")
    XCTAssertNil(you.source)
  }

  // An overlay layer carries a blend mode; additive must round-trip, and the
  // base layer (no blend key) must stay nil (the compositor reads nil = opaque).
  func testParsesAdditiveBlendOverOpaqueBase() {
    CompositeLayers.set(
      """
      [
        {"id":"plate","shader":"image","target":"background","source":"stylized-dark"},
        {"id":"rays","shader":"godrays","target":"background","blend":"additive","uniforms":{"uRayCount":11}}
      ]
      """
    )
    let layers = CompositeLayers.get()
    XCTAssertEqual(layers.count, 2)
    XCTAssertEqual(layers[0].id, "plate")
    XCTAssertNil(layers[0].blend)
    XCTAssertEqual(layers[1].id, "rays")
    XCTAssertEqual(layers[1].blend, "additive")
    assertFloats(layers[1].uniforms["uRayCount"], [11])
  }

  // `id` is always on the wire now; a payload missing it falls back to the array
  // index so the address stays stable and unique-per-stack rather than colliding.
  // Mirrors CompositeLayersTest.fallsBackToIndexWhenIdMissing.
  func testFallsBackToIndexWhenIdMissing() {
    CompositeLayers.set(#"[{"shader":"clouds","uniforms":{}},{"shader":"direct","target":"subject"}]"#)
    let layers = CompositeLayers.get()
    XCTAssertEqual(layers.count, 2)
    XCTAssertEqual(layers[0].id, "0")
    XCTAssertEqual(layers[1].id, "1")
  }

  // target defaults to "background" when the wire omits it.
  func testDefaultsMissingTargetToBackground() {
    CompositeLayers.set(#"[{"shader":"clouds","uniforms":{}}]"#)
    XCTAssertEqual(CompositeLayers.get()[0].target, "background")
  }

  // A scalar uniform normalizes to a one-element array; a numeric array stays a
  // vector, in order.
  func testNormalizesScalarAndVectorUniforms() {
    CompositeLayers.set(#"[{"shader":"plasma","uniforms":{"speed":0.3,"colorA":[0.0,0.3,0.6]}}]"#)
    let u = CompositeLayers.get()[0].uniforms
    assertFloats(u["speed"], [0.3])
    assertFloats(u["colorA"], [0.0, 0.3, 0.6])
  }

  // A uniform whose value is neither a number nor a numeric array is skipped;
  // the shader keeps its MSL default for that name. Well-formed siblings stay.
  func testSkipsNonNumericUniformKeepingSiblings() {
    CompositeLayers.set(#"[{"shader":"plasma","uniforms":{"speed":0.3,"bad":"nope"}}]"#)
    let u = CompositeLayers.get()[0].uniforms
    assertFloats(u["speed"], [0.3])
    XCTAssertNil(u["bad"])
  }

  // A layer with no shader is skipped; well-formed siblings survive (the parse
  // is per-layer lenient, not all-or-nothing).
  func testSkipsLayerWithoutShader() {
    CompositeLayers.set(#"[{"target":"background"},{"shader":"direct","target":"subject"}]"#)
    let layers = CompositeLayers.get()
    XCTAssertEqual(layers.count, 1)
    XCTAssertEqual(layers[0].shader, "direct")
  }

  func testParsesEmptyStack() {
    CompositeLayers.set("[]")
    XCTAssertTrue(CompositeLayers.get().isEmpty)
  }

  // A whole-payload parse failure (not a JSON array) leaves the previous composite
  // in place rather than blanking the frame.
  func testKeepsPreviousCompositeOnMalformedPayload() {
    CompositeLayers.set(#"[{"shader":"direct","target":"subject"}]"#)
    CompositeLayers.set("not json at all")
    let layers = CompositeLayers.get()
    XCTAssertEqual(layers.count, 1)
    XCTAssertEqual(layers[0].shader, "direct")
  }

  // clear() drops the active composite (a non-composite effect taking over).
  func testClearEmptiesStack() {
    CompositeLayers.set(#"[{"shader":"direct","target":"subject"}]"#)
    CompositeLayers.clear()
    XCTAssertTrue(CompositeLayers.get().isEmpty)
  }

  // MARK: - helpers

  private func assertFloats(
    _ actual: [Float]?,
    _ expected: [Float],
    file: StaticString = #filePath,
    line: UInt = #line
  ) {
    guard let actual = actual else {
      XCTFail("expected \(expected), got nil", file: file, line: line)
      return
    }
    XCTAssertEqual(actual.count, expected.count, "length mismatch", file: file, line: line)
    for (a, e) in zip(actual, expected) {
      XCTAssertEqual(a, e, accuracy: 1e-6, file: file, line: line)
    }
  }
}

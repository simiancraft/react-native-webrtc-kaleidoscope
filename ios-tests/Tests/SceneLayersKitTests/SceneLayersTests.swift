import XCTest

@testable import SceneLayersKit

/// Unit tests for the scene layer-stack wire contract on iOS: the JSON that
/// serializeSceneLayers (src/index.ts) sends across the bridge and that
/// SceneLayers.set/get/clear parses into the snapshot the compositor reads each
/// frame. These mirror, case for case, android/.../SceneLayersTest.kt, so a
/// divergence in either parser fails on one side. The wire shape and the rules
/// (target default, scalar/vector uniform normalization, lenient per-layer skip,
/// keep-previous on a whole-payload failure) are the shared contract; the two
/// implementations are different languages but MUST agree here.
final class SceneLayersTests: XCTestCase {
  // SceneLayers is a process-global singleton; reset between cases so a prior
  // set() can't leak into the next assertion.
  override func setUp() {
    super.setUp()
    SceneLayers.clear()
  }

  // The wizard-tower scene exactly as serializeSceneLayers emits it: a
  // generative base (clouds, uniforms), the cut-out plate (image, source = the
  // stable plate id), then you (direct, subject). The canonical happy path.
  func testParsesWizardTowerStack() {
    SceneLayers.set(
      """
      [
        {"shader":"clouds","target":"background","uniforms":{"uExposure":1.26,"uSkyLowColor":[0.99,0.62,0.03],"uCloudSpeed":0.92}},
        {"shader":"image","target":"background","source":"wizards-tower"},
        {"shader":"direct","target":"subject"}
      ]
      """
    )
    let layers = SceneLayers.get()
    XCTAssertEqual(layers.count, 3)

    let clouds = layers[0]
    XCTAssertEqual(clouds.shader, "clouds")
    XCTAssertEqual(clouds.target, "background")
    XCTAssertNil(clouds.blend)
    XCTAssertNil(clouds.source)
    assertFloats(clouds.uniforms["uExposure"], [1.26])
    assertFloats(clouds.uniforms["uSkyLowColor"], [0.99, 0.62, 0.03])

    let plate = layers[1]
    XCTAssertEqual(plate.shader, "image")
    XCTAssertEqual(plate.source, "wizards-tower")
    XCTAssertTrue(plate.uniforms.isEmpty)

    let you = layers[2]
    XCTAssertEqual(you.shader, "direct")
    XCTAssertEqual(you.target, "subject")
    XCTAssertNil(you.source)
  }

  // An overlay layer carries a blend mode; additive must round-trip, and the
  // base layer (no blend key) must stay nil (the compositor reads nil = opaque).
  func testParsesAdditiveBlendOverOpaqueBase() {
    SceneLayers.set(
      """
      [
        {"shader":"image","target":"background","source":"stylized-dark"},
        {"shader":"godrays","target":"background","blend":"additive","uniforms":{"uRayCount":11}}
      ]
      """
    )
    let layers = SceneLayers.get()
    XCTAssertEqual(layers.count, 2)
    XCTAssertNil(layers[0].blend)
    XCTAssertEqual(layers[1].blend, "additive")
    assertFloats(layers[1].uniforms["uRayCount"], [11])
  }

  // target defaults to "background" when the wire omits it.
  func testDefaultsMissingTargetToBackground() {
    SceneLayers.set(#"[{"shader":"clouds","uniforms":{}}]"#)
    XCTAssertEqual(SceneLayers.get()[0].target, "background")
  }

  // A scalar uniform normalizes to a one-element array; a numeric array stays a
  // vector, in order.
  func testNormalizesScalarAndVectorUniforms() {
    SceneLayers.set(#"[{"shader":"plasma","uniforms":{"speed":0.3,"colorA":[0.0,0.3,0.6]}}]"#)
    let u = SceneLayers.get()[0].uniforms
    assertFloats(u["speed"], [0.3])
    assertFloats(u["colorA"], [0.0, 0.3, 0.6])
  }

  // A uniform whose value is neither a number nor a numeric array is skipped;
  // the shader keeps its MSL default for that name. Well-formed siblings stay.
  func testSkipsNonNumericUniformKeepingSiblings() {
    SceneLayers.set(#"[{"shader":"plasma","uniforms":{"speed":0.3,"bad":"nope"}}]"#)
    let u = SceneLayers.get()[0].uniforms
    assertFloats(u["speed"], [0.3])
    XCTAssertNil(u["bad"])
  }

  // A layer with no shader is skipped; well-formed siblings survive (the parse
  // is per-layer lenient, not all-or-nothing).
  func testSkipsLayerWithoutShader() {
    SceneLayers.set(#"[{"target":"background"},{"shader":"direct","target":"subject"}]"#)
    let layers = SceneLayers.get()
    XCTAssertEqual(layers.count, 1)
    XCTAssertEqual(layers[0].shader, "direct")
  }

  func testParsesEmptyStack() {
    SceneLayers.set("[]")
    XCTAssertTrue(SceneLayers.get().isEmpty)
  }

  // A whole-payload parse failure (not a JSON array) leaves the previous scene
  // in place rather than blanking the frame.
  func testKeepsPreviousSceneOnMalformedPayload() {
    SceneLayers.set(#"[{"shader":"direct","target":"subject"}]"#)
    SceneLayers.set("not json at all")
    let layers = SceneLayers.get()
    XCTAssertEqual(layers.count, 1)
    XCTAssertEqual(layers[0].shader, "direct")
  }

  // clear() drops the active scene (a non-scene effect taking over).
  func testClearEmptiesStack() {
    SceneLayers.set(#"[{"shader":"direct","target":"subject"}]"#)
    SceneLayers.clear()
    XCTAssertTrue(SceneLayers.get().isEmpty)
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

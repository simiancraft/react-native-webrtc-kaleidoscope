import fs from 'node:fs';
import path from 'node:path';
import { LOG_TAG } from '../lib/constants';
import { copyRefs } from '../lib/file-manipulation';
import { collectReferencedAssets, PRESET_BOOK_FILENAME } from '../lib/preset-book';

// Structural subset of @expo/config-plugins' IOSConfig.XcodeUtils we use. Typed
// locally (not imported) so this file has zero compile-time coupling to a package
// that is only require()'d lazily at RUNTIME, resolved from the consumer where it
// is installed (a top-level import would break the EAS load; see ios/index.ts).
type PbxProject = { writeSync(): string };
type XcodeUtils = {
  getPbxproj(projectRoot: string): PbxProject;
  addResourceFileToGroup(options: {
    filepath: string;
    groupName: string;
    isBuildFile: boolean;
    project: PbxProject;
    verbose: boolean;
  }): void;
};

// Lazy-resolve @expo/config-plugins' XcodeUtils from the CONSUMER. A top-level
// import would throw module-not-found on an EAS worker, where this plugin loads
// from a realpath with no node_modules (see ios/index.ts). Returns null (warn) on
// failure so the caller bails non-fatally.
function loadXcodeUtils(projectRoot: string): XcodeUtils | null {
  try {
    const configPlugins = require(
      require.resolve('@expo/config-plugins', { paths: [projectRoot] }),
    );
    return configPlugins.IOSConfig.XcodeUtils;
  } catch (error) {
    console.warn(
      `${LOG_TAG} Could not load @expo/config-plugins to register iOS resources; bundled images/thumbnails may be missing at runtime. ${String(error)}`,
    );
    return null;
  }
}

// The app-target name is the `<name>.xcodeproj` basename under the iOS project
// root. Returns null (warn) when it isn't there yet.
function findProjectName(platformProjectRoot: string): string | null {
  try {
    const xcodeprojDir = fs
      .readdirSync(platformProjectRoot)
      .find((entry) => entry.endsWith('.xcodeproj'));
    if (!xcodeprojDir) {
      console.warn(
        `${LOG_TAG} No .xcodeproj under the iOS project root yet; skipping iOS resource registration.`,
      );
      return null;
    }
    return xcodeprojDir.replace(/\.xcodeproj$/, '');
  } catch (error) {
    console.warn(
      `${LOG_TAG} Could not locate the iOS .xcodeproj; skipping iOS resource registration. ${String(error)}`,
    );
    return null;
  }
}

/**
 * Copy every referenced image plate AND composite thumbnail into the iOS app
 * target's resources, then register each in the pbxproj's Copy Bundle Resources
 * phase so the WebP ships in the .app. Xcode flattens resource refs into the
 * bundle root, so each lands as `<id>.webp` in Bundle.main; CompositeProcessor and
 * the picker resolve by that basename. Idempotent; non-fatal (warn, never throw).
 */
export function copyIosAssets(projectRoot: string, platformProjectRoot: string): void {
  const assets = collectReferencedAssets(projectRoot);
  if (!assets) return;
  const refs = [...assets.images, ...assets.thumbs];
  if (refs.length === 0) return;

  const xcodeUtils = loadXcodeUtils(projectRoot);
  if (!xcodeUtils) return;
  const projectName = findProjectName(platformProjectRoot);
  if (!projectName) return;

  const copiedIds = copyRefs(refs, path.join(platformProjectRoot, projectName));
  if (copiedIds.length === 0) {
    console.warn(`${LOG_TAG} No iOS resources resolved; skipping pbxproj resource registration.`);
    return;
  }

  let project: PbxProject;
  try {
    project = xcodeUtils.getPbxproj(projectRoot);
  } catch (error) {
    console.warn(
      `${LOG_TAG} Could not read the iOS pbxproj to register resources; bundled images/thumbnails may be missing at runtime. ${String(error)}`,
    );
    return;
  }
  for (const id of copiedIds) {
    xcodeUtils.addResourceFileToGroup({
      filepath: `${projectName}/${id}.webp`,
      groupName: projectName,
      isBuildFile: true,
      project,
      verbose: false,
    });
  }
  fs.writeFileSync(
    path.join(platformProjectRoot, `${projectName}.xcodeproj`, 'project.pbxproj'),
    project.writeSync(),
  );
  console.log(
    `${LOG_TAG} Bundled ${copiedIds.length} resource(s) into the iOS app target from ${PRESET_BOOK_FILENAME}.`,
  );
}

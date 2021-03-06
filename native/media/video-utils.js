// @flow

import type {
  MediaMissionStep,
  MediaMissionFailure,
  VideoProbeMediaMissionStep,
  Dimensions,
} from 'lib/types/media-types';

import filesystem from 'react-native-fs';
import { Platform } from 'react-native';
import invariant from 'invariant';

import { mediaConfig, pathFromURI } from 'lib/media/file-utils';
import { getVideoProcessingPlan } from 'lib/media/video-utils';
import { getMessageForException } from 'lib/utils/errors';

import { ffmpeg } from './ffmpeg';

// These are some numbers I sorta kinda made up
// We should try to calculate them on a per-device basis
const uploadSpeeds = Object.freeze({
  wifi: 4096, // in KiB/s
  cellular: 512, // in KiB/s
});
const clientTranscodeSpeed = 1.15; // in seconds of video transcoded per second

type ProcessVideoInfo = {|
  uri: string,
  mime: string,
  filename: string,
  fileSize: number,
  dimensions: Dimensions,
  hasWiFi: boolean,
|};
type ProcessVideoResponse = {|
  success: true,
  uri: string,
  mime: string,
  dimensions: Dimensions,
  loop: boolean,
|};
async function processVideo(
  input: ProcessVideoInfo,
): Promise<{|
  steps: $ReadOnlyArray<MediaMissionStep>,
  result: MediaMissionFailure | ProcessVideoResponse,
|}> {
  const steps = [];

  const path = pathFromURI(input.uri);
  invariant(path, `could not extract path from ${input.uri}`);

  const initialCheckStep = await checkVideoInfo(path);
  steps.push(initialCheckStep);
  if (!initialCheckStep.success || !initialCheckStep.duration) {
    return { steps, result: { success: false, reason: 'video_probe_failed' } };
  }
  const { validFormat, duration } = initialCheckStep;

  const plan = getVideoProcessingPlan({
    inputPath: path,
    inputHasCorrectContainerAndCodec: validFormat,
    inputFileSize: input.fileSize,
    inputFilename: input.filename,
    inputDuration: duration,
    inputDimensions: input.dimensions,
    outputDirectory: Platform.select({
      ios: filesystem.TemporaryDirectoryPath,
      default: `${filesystem.TemporaryDirectoryPath}/`,
    }),
    // We want ffmpeg to use hardware-accelerated encoders. On iOS we can do
    // this using VideoToolbox, but ffmpeg on Android is still missing
    // MediaCodec encoding support: https://trac.ffmpeg.org/ticket/6407
    outputCodec: Platform.select({
      ios: 'h264_videotoolbox',
      //android: 'h264_mediacodec',
      default: 'h264',
    }),
    clientConnectionInfo: {
      hasWiFi: input.hasWiFi,
      speed: input.hasWiFi ? uploadSpeeds.wifi : uploadSpeeds.cellular,
    },
    clientTranscodeSpeed,
  });
  if (plan.action === 'reject') {
    return { steps, result: plan.failure };
  }
  if (plan.action === 'none') {
    return {
      steps,
      result: {
        success: true,
        uri: input.uri,
        mime: 'video/mp4',
        dimensions: input.dimensions,
        loop: false,
      },
    };
  }
  const { outputPath, ffmpegCommand } = plan;

  let returnCode,
    newPath,
    stats,
    success = false,
    exceptionMessage;
  const start = Date.now();
  try {
    const { rc, lastStats } = await ffmpeg.process(ffmpegCommand, duration);
    success = rc === 0;
    if (success) {
      returnCode = rc;
      newPath = outputPath;
      stats = lastStats;
    }
  } catch (e) {
    exceptionMessage = getMessageForException(e);
  }
  if (!success) {
    unlink(outputPath);
  }

  steps.push({
    step: 'video_ffmpeg_transcode',
    success,
    exceptionMessage,
    time: Date.now() - start,
    returnCode,
    newPath,
    stats,
  });

  if (!success) {
    return {
      steps,
      result: { success: false, reason: 'video_transcode_failed' },
    };
  }

  const transcodeProbeStep = await checkVideoInfo(outputPath);
  steps.push(transcodeProbeStep);
  if (!transcodeProbeStep.validFormat) {
    unlink(outputPath);
    return {
      steps,
      result: { success: false, reason: 'video_transcode_failed' },
    };
  }

  const dimensions = transcodeProbeStep.dimensions
    ? transcodeProbeStep.dimensions
    : input.dimensions;
  const loop = !!(
    mediaConfig[input.mime] &&
    mediaConfig[input.mime].videoConfig &&
    mediaConfig[input.mime].videoConfig.loop
  );
  return {
    steps,
    result: {
      success: true,
      uri: `file://${outputPath}`,
      mime: 'video/mp4',
      dimensions,
      loop,
    },
  };
}

async function checkVideoInfo(
  path: string,
): Promise<VideoProbeMediaMissionStep> {
  let codec,
    format,
    dimensions,
    duration,
    success = false,
    validFormat = false,
    exceptionMessage;
  const start = Date.now();
  try {
    ({ codec, format, dimensions, duration } = await ffmpeg.getVideoInfo(path));
    success = true;
    validFormat = codec === 'h264' && format.includes('mp4');
  } catch (e) {
    exceptionMessage = getMessageForException(e);
  }
  return {
    step: 'video_probe',
    success,
    exceptionMessage,
    time: Date.now() - start,
    path,
    validFormat,
    duration,
    codec,
    format,
    dimensions,
  };
}

async function unlink(path: string) {
  try {
    await filesystem.unlink(path);
  } catch {}
}

export { processVideo };

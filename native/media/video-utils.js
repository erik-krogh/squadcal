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

import { pathFromURI, extensionFromFilename } from 'lib/utils/file-utils';
import { getVideoProcessingPlan } from 'lib/utils/video-utils';

import { ffmpeg } from './ffmpeg';

type ProcessVideoInfo = {|
  uri: string,
  filename: string,
  fileSize: number,
  duration: number,
  dimensions: Dimensions,
|};
type ProcessVideoResponse = {|
  success: true,
  uri: string,
  mime: string,
  dimensions: Dimensions,
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

  const plan = getVideoProcessingPlan({
    inputPath: path,
    inputHasCorrectContainerAndCodec: initialCheckStep.success,
    inputFileSize: input.fileSize,
    inputFilename: input.filename,
    inputDuration: input.duration,
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
  });
  if (!plan) {
    return {
      steps,
      result: {
        success: true,
        uri: input.uri,
        mime: 'video/mp4',
        dimensions: input.dimensions,
      },
    };
  }
  const { outputPath, ffmpegCommand } = plan;

  let returnCode,
    newPath,
    success = false,
    exceptionMessage;
  const start = Date.now();
  try {
    const { rc } = await ffmpeg.process(ffmpegCommand);
    success = rc === 0;
    if (success) {
      returnCode = rc;
      newPath = outputPath;
    }
  } catch (e) {
    if (
      e &&
      typeof e === 'object' &&
      e.message &&
      typeof e.message === 'string'
    ) {
      exceptionMessage = e.message;
    }
  }

  steps.push({
    step: 'video_ffmpeg_transcode',
    success,
    exceptionMessage,
    time: Date.now() - start,
    returnCode,
    newPath,
  });

  if (!success) {
    return {
      steps,
      result: { success: false, reason: 'video_transcode_failed' },
    };
  }

  const transcodeProbeStep = await checkVideoInfo(outputPath);
  steps.push(transcodeProbeStep);
  if (!transcodeProbeStep.success) {
    return {
      steps,
      result: { success: false, reason: 'video_transcode_failed' },
    };
  }

  const dimensions = transcodeProbeStep.dimensions
    ? transcodeProbeStep.dimensions
    : input.dimensions;
  return {
    steps,
    result: {
      success: true,
      uri: `file://${outputPath}`,
      mime: 'video/mp4',
      dimensions,
    },
  };
}

async function checkVideoInfo(
  path: string,
): Promise<VideoProbeMediaMissionStep> {
  const ext = extensionFromFilename(path);

  let codec,
    format,
    dimensions,
    success = false,
    exceptionMessage;
  const start = Date.now();
  if (ext === 'mp4' || ext === 'mov') {
    try {
      ({ codec, format, dimensions } = await ffmpeg.getVideoInfo(path));
      success = codec === 'h264' && format.includes('mp4');
    } catch (e) {
      if (
        e &&
        typeof e === 'object' &&
        e.message &&
        typeof e.message === 'string'
      ) {
        exceptionMessage = e.message;
      }
    }
  }

  return {
    step: 'video_probe',
    success,
    exceptionMessage,
    time: Date.now() - start,
    path,
    ext,
    codec,
    format,
    dimensions,
  };
}

export { processVideo };

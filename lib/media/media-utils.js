// @flow

import type { Media } from '../types/media-types';
import type {
  MultimediaMessageInfo,
  RawMultimediaMessageInfo,
} from '../types/message-types';
import type { PlatformDetails } from '../types/device-types';

import invariant from 'invariant';

const maxDimensions = Object.freeze({ width: 1920, height: 1920 });

const localhostRegex = /^http:\/\/localhost/;
function shimUploadURI(uri: string, platformDetails: ?PlatformDetails) {
  if (!platformDetails || platformDetails.platform !== 'android') {
    return uri;
  }
  // We do this for testing in the Android emulator
  return uri.replace(localhostRegex, 'http://10.0.2.2');
}

function contentStringForMediaArray(media: $ReadOnlyArray<Media>): string {
  invariant(media.length > 0, 'there should be some media');
  if (media.length === 1) {
    return `a ${media[0].type}`;
  }
  let firstType;
  for (let single of media) {
    if (!firstType) {
      firstType = single.type;
    }
    if (firstType === single.type) {
      continue;
    } else {
      return 'some media';
    }
  }
  invariant(firstType, 'there should be some media');
  if (firstType === 'photo') {
    firstType = 'image';
  }
  return `some ${firstType}s`;
}

function multimediaMessagePreview(
  messageInfo: MultimediaMessageInfo | RawMultimediaMessageInfo,
): string {
  const mediaContentString = contentStringForMediaArray(messageInfo.media);
  return `sent ${mediaContentString}`;
}

export {
  maxDimensions,
  shimUploadURI,
  contentStringForMediaArray,
  multimediaMessagePreview,
};

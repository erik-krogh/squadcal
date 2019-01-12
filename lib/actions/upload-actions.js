// @flow

import type { FetchJSON } from '../utils/fetch-json';
import type { UploadMultimediaResult } from '../types/media-types';

async function uploadMultimedia(
  fetchJSON: FetchJSON,
  multimedia: Object,
  onProgress: (percent: number) => void,
  abortHandler: (abort: () => void) => void,
): Promise<UploadMultimediaResult> {
  const response = await fetchJSON(
    'upload_multimedia',
    { multimedia: [ multimedia ] },
    { blobUpload: true, onProgress, abortHandler },
  );
  const [ uploadResult ] = response.results;
  return { id: uploadResult.id, uri: uploadResult.uri };
}

const assignMediaServerIDToMessageActionType =
  "ASSIGN_MEDIA_SERVER_ID_TO_MESSAGE";
const assignMediaServerURIToMessageActionType =
  "ASSIGN_MEDIA_SERVER_URI_TO_MESSAGE";

async function deleteUpload(
  fetchJSON: FetchJSON,
  id: string,
): Promise<void> {
  await fetchJSON('delete_upload', { id });
}

export {
  uploadMultimedia,
  assignMediaServerIDToMessageActionType,
  assignMediaServerURIToMessageActionType,
  deleteUpload,
};
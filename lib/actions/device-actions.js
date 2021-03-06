// @flow

import type { FetchJSON } from '../utils/fetch-json';

import { getConfig } from '../utils/config';

const setDeviceTokenActionTypes = Object.freeze({
  started: 'SET_DEVICE_TOKEN_STARTED',
  success: 'SET_DEVICE_TOKEN_SUCCESS',
  failed: 'SET_DEVICE_TOKEN_FAILED',
});
async function setDeviceToken(
  fetchJSON: FetchJSON,
  deviceToken: string,
): Promise<string> {
  await fetchJSON('update_device_token', {
    deviceToken,
    platformDetails: getConfig().platformDetails,
  });
  return deviceToken;
}

export { setDeviceTokenActionTypes, setDeviceToken };

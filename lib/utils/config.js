// @flow

import type { FetchJSON } from './fetch-json';
import type { DispatchRecoveryAttempt } from './action-utils';
import type { PlatformDetails } from '../types/device-types';
import type { LogInActionSource } from '../types/account-types';

import invariant from 'invariant';

export type Config = {
  resolveInvalidatedCookie: ?(
    fetchJSON: FetchJSON,
    dispatchRecoveryAttempt: DispatchRecoveryAttempt,
    source?: LogInActionSource,
  ) => Promise<void>,
  setCookieOnRequest: boolean,
  setSessionIDOnRequest: boolean,
  calendarRangeInactivityLimit: ?number,
  platformDetails: PlatformDetails,
};

let registeredConfig: ?Config = null;

const registerConfig = (config: $Shape<Config>) => {
  registeredConfig = { ...registeredConfig, ...config };
};

const getConfig = (): Config => {
  invariant(registeredConfig, 'config should be set');
  return registeredConfig;
};

export { registerConfig, getConfig };

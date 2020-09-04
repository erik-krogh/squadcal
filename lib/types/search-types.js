// @flow

import type { GlobalUserInfo } from './user-types';

export type UserSearchRequest = {|
  prefix?: string,
|};
export type UserSearchResult = {|
  userInfos: $ReadOnlyArray<GlobalUserInfo>,
|};

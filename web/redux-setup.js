// @flow

import type { BaseNavInfo } from 'lib/types/nav-types';
import type { RawThreadInfo } from 'lib/types/thread-types';
import type { EntryStore } from 'lib/types/entry-types';
import type { BaseAction } from 'lib/types/redux-types';
import type { LoadingStatus } from 'lib/types/loading-types';
import type { CurrentUserInfo, UserInfo } from 'lib/types/user-types';
import type { VerifyField } from 'lib/types/verify-types';
import type { MessageStore } from 'lib/types/message-types';
import type { PingTimestamps } from 'lib/types/ping-types';
import type { ServerRequest } from 'lib/types/request-types';
import type { CalendarFilter } from 'lib/types/filter-types';

import PropTypes from 'prop-types';
import invariant from 'invariant';

import baseReducer from 'lib/reducers/master-reducer';
import {
  newThreadActionTypes,
  deleteThreadActionTypes,
} from 'lib/actions/thread-actions';
import { mostRecentReadThread } from 'lib/selectors/thread-selectors';

export type NavInfo = {|
  ...$Exact<BaseNavInfo>,
  tab: "calendar" | "chat",
  verify: ?string,
  activeChatThreadID: ?string,
|};

export const navInfoPropType = PropTypes.shape({
  startDate: PropTypes.string.isRequired,
  endDate: PropTypes.string.isRequired,
  tab: PropTypes.oneOf(["calendar", "chat"]).isRequired,
  verify: PropTypes.string,
  activeChatThreadID: PropTypes.string,
});

export type WindowDimensions = {| width: number, height: number |};
export type AppState = {|
  navInfo: NavInfo,
  currentUserInfo: ?CurrentUserInfo,
  sessionID: string,
  verifyField: ?VerifyField,
  resetPasswordUsername: string,
  entryStore: EntryStore,
  lastUserInteraction: {[section: string]: number},
  threadInfos: {[id: string]: RawThreadInfo},
  userInfos: {[id: string]: UserInfo},
  messageStore: MessageStore,
  drafts: {[key: string]: string},
  updatesCurrentAsOf: number,
  loadingStatuses: {[key: string]: {[idx: number]: LoadingStatus}},
  pingTimestamps: PingTimestamps,
  activeServerRequests: $ReadOnlyArray<ServerRequest>,
  calendarFilters: $ReadOnlyArray<CalendarFilter>,
  cookie: ?string,
  deviceToken: ?string,
  urlPrefix: string,
  windowDimensions: WindowDimensions,
|};

export const updateNavInfoActionType = "UPDATE_NAV_INFO";
export const updateWindowDimensions = "UPDATE_WINDOW_DIMENSIONS";

export type Action =
  | BaseAction
  | {| type: "UPDATE_NAV_INFO", payload: NavInfo |}
  | {|
      type: "UPDATE_WINDOW_DIMENSIONS",
      payload: WindowDimensions,
    |};

export function reducer(inputState: AppState | void, action: Action) {
  let state = inputState;
  invariant(state, "should be set");
  if (action.type === updateNavInfoActionType) {
    return {
      navInfo: action.payload,
      currentUserInfo: state.currentUserInfo,
      sessionID: state.sessionID,
      verifyField: state.verifyField,
      resetPasswordUsername: state.resetPasswordUsername,
      entryStore: state.entryStore,
      lastUserInteraction: state.lastUserInteraction,
      threadInfos: state.threadInfos,
      userInfos: state.userInfos,
      messageStore: state.messageStore,
      drafts: state.drafts,
      updatesCurrentAsOf: state.updatesCurrentAsOf,
      loadingStatuses: state.loadingStatuses,
      pingTimestamps: state.pingTimestamps,
      activeServerRequests: state.activeServerRequests,
      calendarFilters: state.calendarFilters,
      cookie: state.cookie,
      deviceToken: state.deviceToken,
      urlPrefix: state.urlPrefix,
      windowDimensions: state.windowDimensions,
    };
  } else if (action.type === updateWindowDimensions) {
    return {
      navInfo: state.navInfo,
      currentUserInfo: state.currentUserInfo,
      sessionID: state.sessionID,
      verifyField: state.verifyField,
      resetPasswordUsername: state.resetPasswordUsername,
      entryStore: state.entryStore,
      lastUserInteraction: state.lastUserInteraction,
      threadInfos: state.threadInfos,
      userInfos: state.userInfos,
      messageStore: state.messageStore,
      drafts: state.drafts,
      updatesCurrentAsOf: state.updatesCurrentAsOf,
      loadingStatuses: state.loadingStatuses,
      pingTimestamps: state.pingTimestamps,
      activeServerRequests: state.activeServerRequests,
      calendarFilters: state.calendarFilters,
      cookie: state.cookie,
      deviceToken: state.deviceToken,
      urlPrefix: state.urlPrefix,
      windowDimensions: action.payload,
    };
  }
  const result = baseReducer(state, action);
  if (
    result.navInfo.activeChatThreadID &&
    !result.threadInfos[result.navInfo.activeChatThreadID]
  ) {
    result.navInfo.activeChatThreadID = mostRecentReadThread(
      result.messageStore,
      result.threadInfos,
    );
  }
  return result;
}

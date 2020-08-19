// @flow

import type { BaseAction } from '../types/redux-types';
import type { CurrentUserInfo, UserStore, UserInfo } from '../types/user-types';
import { updateTypes, processUpdatesActionType } from '../types/update-types';
import {
  serverRequestTypes,
  processServerRequestsActionType,
} from '../types/request-types';
import {
  fullStateSyncActionType,
  incrementalStateSyncActionType,
} from '../types/socket-types';
import {
  type UserInconsistencyReportCreationRequest,
  reportTypes,
} from '../types/report-types';

import invariant from 'invariant';
import _keyBy from 'lodash/fp/keyBy';
import _isEqual from 'lodash/fp/isEqual';

import { setNewSessionActionType } from '../utils/action-utils';
import {
  createEntryActionTypes,
  saveEntryActionTypes,
  deleteEntryActionTypes,
  restoreEntryActionTypes,
} from '../actions/entry-actions';
import {
  logOutActionTypes,
  deleteAccountActionTypes,
  logInActionTypes,
  registerActionTypes,
  resetPasswordActionTypes,
  changeUserSettingsActionTypes,
} from '../actions/user-actions';
import { joinThreadActionTypes } from '../actions/thread-actions';

import { getConfig } from '../utils/config';
import { actionLogger } from '../utils/action-logger';
import { sanitizeAction } from '../utils/sanitization';

function reduceCurrentUserInfo(
  state: ?CurrentUserInfo,
  action: BaseAction,
): ?CurrentUserInfo {
  if (
    action.type === logInActionTypes.success ||
    action.type === resetPasswordActionTypes.success ||
    action.type === registerActionTypes.success ||
    action.type === logOutActionTypes.success ||
    action.type === deleteAccountActionTypes.success
  ) {
    if (!_isEqual(action.payload.currentUserInfo)(state)) {
      return action.payload.currentUserInfo;
    }
  } else if (
    action.type === setNewSessionActionType &&
    action.payload.sessionChange.currentUserInfo
  ) {
    const { sessionChange } = action.payload;
    if (!_isEqual(sessionChange.currentUserInfo)(state)) {
      return sessionChange.currentUserInfo;
    }
  } else if (action.type === fullStateSyncActionType) {
    const { currentUserInfo } = action.payload;
    if (!_isEqual(currentUserInfo)(state)) {
      return currentUserInfo;
    }
  } else if (
    action.type === incrementalStateSyncActionType ||
    action.type === processUpdatesActionType
  ) {
    for (let update of action.payload.updatesResult.newUpdates) {
      if (
        update.type === updateTypes.UPDATE_CURRENT_USER &&
        !_isEqual(update.currentUserInfo)(state)
      ) {
        return update.currentUserInfo;
      }
    }
  } else if (action.type === changeUserSettingsActionTypes.success) {
    invariant(
      state && !state.anonymous,
      "can't change settings if not logged in",
    );
    const email = action.payload.email;
    if (!email) {
      return state;
    }
    return {
      id: state.id,
      username: state.username,
      email: email,
      emailVerified: false,
    };
  } else if (action.type === processServerRequestsActionType) {
    const checkStateRequest = action.payload.serverRequests.find(
      candidate => candidate.type === serverRequestTypes.CHECK_STATE,
    );
    if (
      checkStateRequest &&
      checkStateRequest.stateChanges &&
      checkStateRequest.stateChanges.currentUserInfo &&
      !_isEqual(checkStateRequest.stateChanges.currentUserInfo)(state)
    ) {
      return checkStateRequest.stateChanges.currentUserInfo;
    }
  }
  return state;
}

function findInconsistencies(
  action: BaseAction,
  beforeStateCheck: { [id: string]: UserInfo },
  afterStateCheck: { [id: string]: UserInfo },
): UserInconsistencyReportCreationRequest[] {
  if (_isEqual(beforeStateCheck)(afterStateCheck)) {
    return [];
  }
  if (action.type === 'SEND_REPORT_SUCCESS') {
    // We can get a memory leak if we include a previous
    // ClientUserInconsistencyReportCreationRequest in this one
    action = {
      type: 'SEND_REPORT_SUCCESS',
      loadingInfo: action.loadingInfo,
    };
  }
  return [
    {
      type: reportTypes.USER_INCONSISTENCY,
      platformDetails: getConfig().platformDetails,
      action: sanitizeAction(action),
      beforeStateCheck,
      afterStateCheck,
      lastActions: actionLogger.interestingActionSummaries,
      time: Date.now(),
    },
  ];
}

function reduceUserInfos(state: UserStore, action: BaseAction): UserStore {
  if (action.type === joinThreadActionTypes.success) {
    const newUserInfos = _keyBy(userInfo => userInfo.id)(
      action.payload.userInfos,
    );
    // $FlowFixMe should be fixed in flow-bin@0.115 / react-native@0.63
    const updated = { ...state.userInfos, ...newUserInfos };
    if (!_isEqual(state.userInfos)(updated)) {
      return {
        userInfos: updated,
        inconsistencyReports: state.inconsistencyReports,
      };
    }
  } else if (
    action.type === logOutActionTypes.success ||
    action.type === deleteAccountActionTypes.success ||
    (action.type === setNewSessionActionType &&
      action.payload.sessionChange.cookieInvalidated)
  ) {
    if (Object.keys(state.userInfos).length === 0) {
      return state;
    }
    return {
      userInfos: {},
      inconsistencyReports: state.inconsistencyReports,
    };
  } else if (
    action.type === logInActionTypes.success ||
    action.type === registerActionTypes.success ||
    action.type === resetPasswordActionTypes.success ||
    action.type === fullStateSyncActionType
  ) {
    const newUserInfos = _keyBy(userInfo => userInfo.id)(
      action.payload.userInfos,
    );
    if (!_isEqual(state.userInfos)(newUserInfos)) {
      return {
        userInfos: newUserInfos,
        inconsistencyReports: state.inconsistencyReports,
      };
    }
  } else if (
    action.type === incrementalStateSyncActionType ||
    action.type === processUpdatesActionType
  ) {
    const newUserInfos = _keyBy(userInfo => userInfo.id)(
      action.payload.userInfos,
    );
    // $FlowFixMe should be fixed in flow-bin@0.115 / react-native@0.63
    const updated = { ...state.userInfos, ...newUserInfos };
    for (let update of action.payload.updatesResult.newUpdates) {
      if (update.type === updateTypes.DELETE_ACCOUNT) {
        delete updated[update.deletedUserID];
      }
    }
    if (!_isEqual(state.userInfos)(updated)) {
      return {
        userInfos: updated,
        inconsistencyReports: state.inconsistencyReports,
      };
    }
  } else if (
    action.type === createEntryActionTypes.success ||
    action.type === saveEntryActionTypes.success ||
    action.type === restoreEntryActionTypes.success
  ) {
    const newUserInfos = _keyBy(userInfo => userInfo.id)(
      action.payload.updatesResult.userInfos,
    );
    // $FlowFixMe should be fixed in flow-bin@0.115 / react-native@0.63
    const updated = { ...state.userInfos, ...newUserInfos };
    if (!_isEqual(state.userInfos)(updated)) {
      return {
        userInfos: updated,
        inconsistencyReports: state.inconsistencyReports,
      };
    }
  } else if (action.type === deleteEntryActionTypes.success && action.payload) {
    const { updatesResult } = action.payload;
    const newUserInfos = _keyBy(userInfo => userInfo.id)(
      updatesResult.userInfos,
    );
    // $FlowFixMe should be fixed in flow-bin@0.115 / react-native@0.63
    const updated = { ...state.userInfos, ...newUserInfos };
    if (!_isEqual(state.userInfos)(updated)) {
      return {
        userInfos: updated,
        inconsistencyReports: state.inconsistencyReports,
      };
    }
  } else if (action.type === processServerRequestsActionType) {
    const checkStateRequest = action.payload.serverRequests.find(
      candidate => candidate.type === serverRequestTypes.CHECK_STATE,
    );
    if (!checkStateRequest || !checkStateRequest.stateChanges) {
      return state;
    }
    const { userInfos, deleteUserInfoIDs } = checkStateRequest.stateChanges;
    if (!userInfos && !deleteUserInfoIDs) {
      return state;
    }

    const newUserInfos = { ...state.userInfos };
    if (userInfos) {
      for (const userInfo of userInfos) {
        newUserInfos[userInfo.id] = userInfo;
      }
    }
    if (deleteUserInfoIDs) {
      for (const deleteUserInfoID of deleteUserInfoIDs) {
        delete newUserInfos[deleteUserInfoID];
      }
    }

    const newInconsistencies = findInconsistencies(
      action,
      state.userInfos,
      newUserInfos,
    );
    return {
      userInfos: newUserInfos,
      inconsistencyReports: [
        ...state.inconsistencyReports,
        ...newInconsistencies,
      ],
    };
  }
  return state;
}

export { reduceCurrentUserInfo, reduceUserInfos };

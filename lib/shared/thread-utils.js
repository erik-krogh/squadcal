// @flow

import {
  type RawThreadInfo,
  type ThreadInfo,
  type ThreadPermission,
  type MemberInfo,
  type ServerThreadInfo,
  type RelativeMemberInfo,
  type ThreadCurrentUserInfo,
  threadTypes,
  threadPermissions,
} from '../types/thread-types';
import type { UserInfo } from '../types/user-types';
import { type UpdateInfo, updateTypes } from '../types/update-types';
import { userRelationshipStatus } from '../types/relationship-types';

import tinycolor from 'tinycolor2';

import { pluralize } from '../utils/text-utils';
import {
  permissionLookup,
  getAllThreadPermissions,
} from '../permissions/thread-permissions';

function colorIsDark(color: string) {
  return tinycolor(`#${color}`).isDark();
}

// Randomly distributed in RGB-space
const hexNumerals = '0123456789abcdef';
function generateRandomColor() {
  let color = '';
  for (let i = 0; i < 6; i++) {
    color += hexNumerals[Math.floor(Math.random() * 16)];
  }
  return color;
}

function threadHasPermission(
  threadInfo: ?(ThreadInfo | RawThreadInfo),
  permission: ThreadPermission,
): boolean {
  if (!threadInfo || !threadInfo.currentUser.permissions[permission]) {
    return false;
  }
  return threadInfo.currentUser.permissions[permission].value;
}

function viewerIsMember(threadInfo: ?(ThreadInfo | RawThreadInfo)): boolean {
  return !!(
    threadInfo &&
    threadInfo.currentUser.role !== null &&
    threadInfo.currentUser.role !== undefined
  );
}

function threadIsInHome(threadInfo: ?(ThreadInfo | RawThreadInfo)): boolean {
  return !!(threadInfo && threadInfo.currentUser.subscription.home);
}

// Can have messages
function threadInChatList(threadInfo: ?(ThreadInfo | RawThreadInfo)): boolean {
  return (
    viewerIsMember(threadInfo) &&
    threadHasPermission(threadInfo, threadPermissions.VISIBLE)
  );
}

function threadIsTopLevel(threadInfo: ?(ThreadInfo | RawThreadInfo)): boolean {
  return !!(
    threadInChatList(threadInfo) &&
    threadInfo &&
    threadInfo.type !== threadTypes.SIDEBAR
  );
}

function threadInBackgroundChatList(
  threadInfo: ?(ThreadInfo | RawThreadInfo),
): boolean {
  return threadInChatList(threadInfo) && !threadIsInHome(threadInfo);
}

function threadInHomeChatList(
  threadInfo: ?(ThreadInfo | RawThreadInfo),
): boolean {
  return threadInChatList(threadInfo) && threadIsInHome(threadInfo);
}

// Can have Calendar entries,
// does appear as a top-level entity in the thread list
function threadInFilterList(
  threadInfo: ?(ThreadInfo | RawThreadInfo),
): boolean {
  return (
    threadInChatList(threadInfo) &&
    !!threadInfo &&
    threadInfo.type !== threadTypes.SIDEBAR
  );
}

function userIsMember(
  threadInfo: ?(ThreadInfo | RawThreadInfo),
  userID: string,
): boolean {
  if (!threadInfo) {
    return false;
  }
  return threadInfo.members.some(
    member =>
      member.id === userID && member.role !== null && member.role !== undefined,
  );
}

function threadActualMembers(
  memberInfos: $ReadOnlyArray<MemberInfo>,
): $ReadOnlyArray<string> {
  return memberInfos
    .filter(
      memberInfo => memberInfo.role !== null && memberInfo.role !== undefined,
    )
    .map(memberInfo => memberInfo.id);
}

function threadIsPersonalChat(threadInfo: ThreadInfo | RawThreadInfo) {
  return threadInfo.members.length === 1;
}

function threadIsTwoPersonChat(threadInfo: ThreadInfo | RawThreadInfo) {
  return threadInfo.members.length === 2;
}

function rawThreadInfoFromServerThreadInfo(
  serverThreadInfo: ServerThreadInfo,
  viewerID: string,
): ?RawThreadInfo {
  const members = [];
  let currentUser;
  for (let serverMember of serverThreadInfo.members) {
    // This is a hack, similar to what we have in ThreadSettingsMember.
    // Basically we only want to return users that are either a member of this
    // thread, or are a "parent admin". We approximate "parent admin" by
    // looking for the PERMISSION_CHANGE_ROLE permission.
    if (
      serverMember.id !== viewerID &&
      !serverMember.role &&
      !serverMember.permissions[threadPermissions.CHANGE_ROLE].value
    ) {
      continue;
    }
    members.push({
      id: serverMember.id,
      role: serverMember.role,
      permissions: serverMember.permissions,
    });
    if (serverMember.id === viewerID) {
      currentUser = {
        role: serverMember.role,
        permissions: serverMember.permissions,
        subscription: serverMember.subscription,
        unread: serverMember.unread,
      };
    }
  }

  let currentUserPermissions;
  if (currentUser) {
    currentUserPermissions = currentUser.permissions;
  } else {
    currentUserPermissions = getAllThreadPermissions(null, serverThreadInfo.id);
    currentUser = {
      role: null,
      permissions: currentUserPermissions,
      subscription: {
        home: false,
        pushNotifs: false,
      },
      unread: null,
    };
  }
  if (!permissionLookup(currentUserPermissions, threadPermissions.KNOW_OF)) {
    return null;
  }

  return {
    id: serverThreadInfo.id,
    type: serverThreadInfo.type,
    visibilityRules: serverThreadInfo.type,
    name: serverThreadInfo.name,
    description: serverThreadInfo.description,
    color: serverThreadInfo.color,
    creationTime: serverThreadInfo.creationTime,
    parentThreadID: serverThreadInfo.parentThreadID,
    members,
    roles: serverThreadInfo.roles,
    currentUser,
  };
}

function robotextName(
  threadInfo: RawThreadInfo | ThreadInfo,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
): string {
  const threadUsernames: string[] = threadInfo.members
    .filter(threadMember => threadMember.id !== viewerID)
    .map(
      threadMember =>
        userInfos[threadMember.id] && userInfos[threadMember.id].username,
    )
    .filter(Boolean);
  if (threadUsernames.length === 0) {
    return 'just you';
  }
  return pluralize(threadUsernames);
}

function threadUIName(
  threadInfo: RawThreadInfo | ThreadInfo,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
): string {
  if (threadInfo.name) {
    return threadInfo.name;
  }
  return robotextName(threadInfo, viewerID, userInfos);
}

function threadInfoFromRawThreadInfo(
  rawThreadInfo: RawThreadInfo,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
): ThreadInfo {
  return {
    id: rawThreadInfo.id,
    type: rawThreadInfo.type,
    name: rawThreadInfo.name,
    uiName: threadUIName(rawThreadInfo, viewerID, userInfos),
    description: rawThreadInfo.description,
    color: rawThreadInfo.color,
    creationTime: rawThreadInfo.creationTime,
    parentThreadID: rawThreadInfo.parentThreadID,
    members: rawThreadInfo.members,
    roles: rawThreadInfo.roles,
    currentUser: getCurrentUser(rawThreadInfo, viewerID, userInfos),
  };
}

function getCurrentUser(
  rawThreadInfo: RawThreadInfo,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
) {
  if (!threadIsWithBlockedUserOnly(rawThreadInfo, viewerID, userInfos)) {
    return rawThreadInfo.currentUser;
  } else {
    const updatedPermissions = Object.assign(
      {},
      rawThreadInfo.currentUser.permissions,
      { [threadPermissions.VOICED]: { value: false, source: null } },
    );

    const updatedCurrentUser: ThreadCurrentUserInfo = {
      ...rawThreadInfo.currentUser,
      permissions: updatedPermissions,
    };

    return updatedCurrentUser;
  }
}

function threadIsWithBlockedUserOnly(
  rawThreadInfo: RawThreadInfo,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
): boolean {
  if (!threadIsTwoPersonChat(rawThreadInfo)) {
    return false;
  } else {
    const otherUserInfo = rawThreadInfo.members
      .filter(threadMember => threadMember.id !== viewerID)
      .map(threadMember => userInfos[threadMember.id]);
    const otherUserRelationshipStatus = otherUserInfo[0].relationshipStatus;

    return (
      otherUserRelationshipStatus ===
        userRelationshipStatus.BLOCKED_BY_VIEWER ||
      otherUserRelationshipStatus === userRelationshipStatus.BLOCKED_VIEWER ||
      otherUserRelationshipStatus === userRelationshipStatus.BOTH_BLOCKED
    );
  }
}

function rawThreadInfoFromThreadInfo(threadInfo: ThreadInfo): RawThreadInfo {
  return {
    id: threadInfo.id,
    type: threadInfo.type,
    visibilityRules: threadInfo.type,
    name: threadInfo.name,
    description: threadInfo.description,
    color: threadInfo.color,
    creationTime: threadInfo.creationTime,
    parentThreadID: threadInfo.parentThreadID,
    members: threadInfo.members,
    roles: threadInfo.roles,
    currentUser: threadInfo.currentUser,
  };
}

const threadTypeDescriptions = {
  [threadTypes.CHAT_NESTED_OPEN]:
    'Anybody in the parent thread can see an open child thread.',
  [threadTypes.CHAT_SECRET]:
    'Only visible to its members and admins of ancestor threads.',
};

function usersInThreadInfo(threadInfo: RawThreadInfo | ThreadInfo): string[] {
  const userIDs = new Set();
  for (let member of threadInfo.members) {
    userIDs.add(member.id);
  }
  return [...userIDs];
}

function memberIsAdmin(memberInfo: RelativeMemberInfo, threadInfo: ThreadInfo) {
  const role = memberInfo.role && threadInfo.roles[memberInfo.role];
  return role && !role.isDefault && role.name === 'Admins';
}

function identifyInvalidatedThreads(
  updateInfos: $ReadOnlyArray<UpdateInfo>,
): Set<string> {
  const invalidated = new Set();
  for (const updateInfo of updateInfos) {
    if (updateInfo.type === updateTypes.DELETE_THREAD) {
      invalidated.add(updateInfo.threadID);
    }
  }
  return invalidated;
}

// Consider updating itemHeight in native/chat/chat-thread-list.react.js
// if you change this
const emptyItemText =
  `Background threads are just like normal threads, except they don't ` +
  `contribute to your unread count.\n\n` +
  `To move a thread over here, switch the “Background” option in its settings.`;

export {
  colorIsDark,
  generateRandomColor,
  threadHasPermission,
  viewerIsMember,
  threadInChatList,
  threadIsTopLevel,
  threadInBackgroundChatList,
  threadInHomeChatList,
  threadIsInHome,
  threadInFilterList,
  userIsMember,
  threadActualMembers,
  threadIsPersonalChat,
  threadIsTwoPersonChat,
  rawThreadInfoFromServerThreadInfo,
  robotextName,
  threadInfoFromRawThreadInfo,
  rawThreadInfoFromThreadInfo,
  threadTypeDescriptions,
  usersInThreadInfo,
  memberIsAdmin,
  identifyInvalidatedThreads,
  emptyItemText,
};

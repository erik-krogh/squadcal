// @flow

import {
  type RoleInfo,
  threadPermissions,
  threadPermissionPrefixes,
  type ThreadRolePermissionsBlob,
  type ThreadType,
  threadTypes,
} from 'lib/types/thread-types';

import { dbQuery, SQL } from '../database/database';
import createIDs from './id-creator';

type InitialRoles = {|
  default: RoleInfo,
  creator: RoleInfo,
|};
async function createInitialRolesForNewThread(
  threadID: string,
  threadType: ThreadType,
): Promise<InitialRoles> {
  const rolePermissions = getRolePermissionBlobsForChat(threadType);
  const ids = await createIDs('roles', Object.values(rolePermissions).length);

  const time = Date.now();
  const newRows = [];
  const namesToIDs = {};
  for (const name in rolePermissions) {
    const id = ids.shift();
    namesToIDs[name] = id;
    const permissionsBlob = JSON.stringify(rolePermissions[name]);
    newRows.push([id, threadID, name, permissionsBlob, time]);
  }

  const query = SQL`
    INSERT INTO roles (id, thread, name, permissions, creation_time)
    VALUES ${newRows}
  `;
  await dbQuery(query);

  const defaultRoleInfo = {
    id: namesToIDs.Members,
    name: 'Members',
    permissions: rolePermissions.Members,
    isDefault: true,
  };
  if (!rolePermissions.Admins) {
    return {
      default: defaultRoleInfo,
      creator: defaultRoleInfo,
    };
  }

  const adminRoleInfo = {
    id: namesToIDs.Admins,
    name: 'Admins',
    permissions: rolePermissions.Admins,
    isDefault: false,
  };
  return {
    default: defaultRoleInfo,
    creator: adminRoleInfo,
  };
}

type RolePermissionBlobs = {|
  Members: ThreadRolePermissionsBlob,
  Admins?: ThreadRolePermissionsBlob,
|};

// Originally all chat threads were orgs, but for the alpha launch I decided
// it's better to keep it simple. I'll probably reintroduce orgs at some point.
// eslint-disable-next-line no-unused-vars
function getRolePermissionBlobsForOrg(): RolePermissionBlobs {
  const openDescendantKnowOf =
    threadPermissionPrefixes.OPEN_DESCENDANT + threadPermissions.KNOW_OF;
  const openDescendantVisible =
    threadPermissionPrefixes.OPEN_DESCENDANT + threadPermissions.VISIBLE;
  const openDescendantJoinThread =
    threadPermissionPrefixes.OPEN_DESCENDANT + threadPermissions.JOIN_THREAD;
  const memberPermissions = {
    [threadPermissions.KNOW_OF]: true,
    [threadPermissions.VISIBLE]: true,
    [threadPermissions.JOIN_THREAD]: true,
    [openDescendantKnowOf]: true,
    [openDescendantVisible]: true,
    [openDescendantJoinThread]: true,
    [threadPermissions.VOICED]: true,
    [threadPermissions.EDIT_ENTRIES]: true,
    [threadPermissions.EDIT_THREAD]: true,
    [threadPermissions.CREATE_SUBTHREADS]: true,
    [threadPermissions.CREATE_SIDEBARS]: true,
    [threadPermissions.ADD_MEMBERS]: true,
  };
  const descendantKnowOf =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.KNOW_OF;
  const descendantVisible =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.VISIBLE;
  const descendantJoinThread =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.JOIN_THREAD;
  const descendantVoiced =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.VOICED;
  const descendantEditEntries =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.EDIT_ENTRIES;
  const descendantEditThread =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.EDIT_THREAD;
  const descendantCreateSubthreads =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.CREATE_SUBTHREADS;
  const descendantCreateSidebars =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.CREATE_SIDEBARS;
  const descendantAddMembers =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.ADD_MEMBERS;
  const descendantDeleteThread =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.DELETE_THREAD;
  const descendantEditPermissions =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.EDIT_PERMISSIONS;
  const descendantRemoveMembers =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.REMOVE_MEMBERS;
  const descendantChangeRole =
    threadPermissionPrefixes.DESCENDANT + threadPermissions.CHANGE_ROLE;
  const adminPermissions = {
    [threadPermissions.KNOW_OF]: true,
    [threadPermissions.VISIBLE]: true,
    [threadPermissions.JOIN_THREAD]: true,
    [threadPermissions.VOICED]: true,
    [threadPermissions.EDIT_ENTRIES]: true,
    [threadPermissions.EDIT_THREAD]: true,
    [threadPermissions.CREATE_SUBTHREADS]: true,
    [threadPermissions.CREATE_SIDEBARS]: true,
    [threadPermissions.ADD_MEMBERS]: true,
    [threadPermissions.DELETE_THREAD]: true,
    [threadPermissions.EDIT_PERMISSIONS]: true,
    [threadPermissions.REMOVE_MEMBERS]: true,
    [threadPermissions.CHANGE_ROLE]: true,
    [descendantKnowOf]: true,
    [descendantVisible]: true,
    [descendantJoinThread]: true,
    [descendantVoiced]: true,
    [descendantEditEntries]: true,
    [descendantEditThread]: true,
    [descendantCreateSubthreads]: true,
    [descendantCreateSidebars]: true,
    [descendantAddMembers]: true,
    [descendantDeleteThread]: true,
    [descendantEditPermissions]: true,
    [descendantRemoveMembers]: true,
    [descendantChangeRole]: true,
  };
  return {
    Members: memberPermissions,
    Admins: adminPermissions,
  };
}

function getRolePermissionBlobsForChat(
  threadType: ThreadType,
): RolePermissionBlobs {
  if (threadType === threadTypes.SIDEBAR) {
    const memberPermissions = {
      [threadPermissions.KNOW_OF]: true,
      [threadPermissions.VISIBLE]: true,
      [threadPermissions.VOICED]: true,
      [threadPermissions.EDIT_THREAD]: true,
      [threadPermissions.ADD_MEMBERS]: true,
      [threadPermissions.EDIT_PERMISSIONS]: true,
      [threadPermissions.REMOVE_MEMBERS]: true,
    };
    return {
      Members: memberPermissions,
    };
  }

  const openDescendantKnowOf =
    threadPermissionPrefixes.OPEN_DESCENDANT + threadPermissions.KNOW_OF;
  const openDescendantVisible =
    threadPermissionPrefixes.OPEN_DESCENDANT + threadPermissions.VISIBLE;
  const openDescendantJoinThread =
    threadPermissionPrefixes.OPEN_DESCENDANT + threadPermissions.JOIN_THREAD;

  if (threadType === threadTypes.PERSONAL) {
    return {
      Members: {
        [threadPermissions.KNOW_OF]: true,
        [threadPermissions.VISIBLE]: true,
        [threadPermissions.VOICED]: true,
        [threadPermissions.EDIT_ENTRIES]: true,
        [threadPermissions.EDIT_THREAD]: true,
        [threadPermissions.CREATE_SUBTHREADS]: true,
        [threadPermissions.CREATE_SIDEBARS]: true,
        [openDescendantKnowOf]: true,
        [openDescendantVisible]: true,
        [openDescendantJoinThread]: true,
      },
    };
  }

  const memberPermissions = {
    [threadPermissions.KNOW_OF]: true,
    [threadPermissions.VISIBLE]: true,
    [threadPermissions.JOIN_THREAD]: true,
    [threadPermissions.VOICED]: true,
    [threadPermissions.EDIT_ENTRIES]: true,
    [threadPermissions.EDIT_THREAD]: true,
    [threadPermissions.CREATE_SUBTHREADS]: true,
    [threadPermissions.CREATE_SIDEBARS]: true,
    [threadPermissions.ADD_MEMBERS]: true,
    [threadPermissions.EDIT_PERMISSIONS]: true,
    [threadPermissions.REMOVE_MEMBERS]: true,
    [openDescendantKnowOf]: true,
    [openDescendantVisible]: true,
    [openDescendantJoinThread]: true,
  };
  return {
    Members: memberPermissions,
  };
}

export { createInitialRolesForNewThread, getRolePermissionBlobsForChat };

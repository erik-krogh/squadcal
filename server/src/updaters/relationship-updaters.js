// @flow

import type { Viewer } from '../session/viewer';
import {
  type RelationshipRequest,
  type RelationshipErrors,
  relationshipActions,
  undirectedStatus,
  directedStatus,
} from 'lib/types/relationship-types';
import { updateTypes } from 'lib/types/update-types';

import invariant from 'invariant';

import { ServerError } from 'lib/utils/errors';

import { fetchUserInfos } from '../fetchers/user-fetchers';
import { fetchFriendRequestRelationshipOperations } from '../fetchers/relationship-fetchers';
import { createUpdates } from '../creators/update-creator';
import { dbQuery, SQL } from '../database';

async function updateRelationships(
  viewer: Viewer,
  request: RelationshipRequest,
) {
  const { action } = request;

  if (!viewer.loggedIn) {
    throw new ServerError('not_logged_in');
  }

  const uniqueUserIDs = [...new Set(request.userIDs)];
  const users = await fetchUserInfos(uniqueUserIDs);

  let errors: RelationshipErrors = {};
  const userIDs: string[] = [];
  for (let userID of uniqueUserIDs) {
    if (userID === viewer.userID || !users[userID].username) {
      const acc = errors.invalid_user || [];
      errors.invalid_user = [...acc, userID];
    } else {
      userIDs.push(userID);
    }
  }
  if (!userIDs.length) {
    return errors;
  }

  const updateIDs = [];
  if (action === relationshipActions.FRIEND) {
    const {
      userRelationshipOperations,
      errors: friendRequestErrors,
    } = await fetchFriendRequestRelationshipOperations(viewer, userIDs);
    errors = { ...errors, ...friendRequestErrors };

    const undirectedInsertRows = [];
    const directedInsertRows = [];
    const directedDeleteIDs = [];
    for (const userID in userRelationshipOperations) {
      const operations = userRelationshipOperations[userID];
      const ids = sortIDs(viewer.userID, userID);

      if (operations.length) {
        updateIDs.push(userID);
      }

      for (const operation of operations) {
        if (operation === 'delete_directed') {
          directedDeleteIDs.push(userID);
        } else if (operation === 'friend') {
          undirectedInsertRows.push([...ids, undirectedStatus.FRIEND]);
        } else if (operation === 'pending_friend') {
          const status = directedStatus.PENDING_FRIEND;
          directedInsertRows.push([viewer.userID, userID, status]);
        } else if (operation === 'know_of') {
          undirectedInsertRows.push([...ids, undirectedStatus.KNOW_OF]);
        } else {
          invariant(false, `unexpected relationship operation ${operation}`);
        }
      }
    }

    const promises = [];
    if (undirectedInsertRows.length) {
      const undirectedInsertQuery = SQL`
        INSERT INTO relationships_undirected (user1, user2, status)
        VALUES ${undirectedInsertRows}
        ON DUPLICATE KEY UPDATE status = GREATEST(status, VALUES(status))
      `;
      promises.push(dbQuery(undirectedInsertQuery));
    }
    if (directedInsertRows.length) {
      const directedInsertQuery = SQL`
        INSERT INTO relationships_directed (user1, user2, status)
        VALUES ${directedInsertRows}
        ON DUPLICATE KEY UPDATE status = VALUES(status)
      `;
      promises.push(dbQuery(directedInsertQuery));
    }
    if (directedDeleteIDs.length) {
      const directedDeleteQuery = SQL`
        DELETE FROM relationships_directed
        WHERE 
          (user1 = ${viewer.userID} AND user2 IN (${directedDeleteIDs})) OR
          (status = ${directedStatus.PENDING_FRIEND} AND 
            user1 IN (${directedDeleteIDs}) AND user2 = ${viewer.userID})
      `;
      promises.push(dbQuery(directedDeleteQuery));
    }

    await Promise.all(promises);
  } else if (action === relationshipActions.UNFRIEND) {
    updateIDs.push(...userIDs);

    const updateRows = userIDs.map(userID => {
      const ids = sortIDs(viewer.userID, userID);
      return [...ids, undirectedStatus.KNOW_OF];
    });
    const insertQuery = SQL`
      INSERT INTO relationships_undirected (user1, user2, status)
      VALUES ${updateRows}
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `;
    const deleteQuery = SQL`
      DELETE FROM relationships_directed
      WHERE 
        status = ${directedStatus.PENDING_FRIEND} AND 
        (user1 = ${viewer.userID} AND user2 IN (${userIDs}) OR 
          user1 IN (${userIDs}) AND user2 = ${viewer.userID})
    `;

    await Promise.all([dbQuery(insertQuery), dbQuery(deleteQuery)]);
  } else if (action === relationshipActions.BLOCK) {
    updateIDs.push(...userIDs);

    const directedRows = [];
    const undirectedRows = [];
    for (const userID of userIDs) {
      directedRows.push([viewer.userID, userID, directedStatus.BLOCKED]);
      const ids = sortIDs(viewer.userID, userID);
      undirectedRows.push([...ids, undirectedStatus.KNOW_OF]);
    }

    const directedInsertQuery = SQL`
      INSERT INTO relationships_directed (user1, user2, status)
      VALUES ${directedRows}
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `;
    const directedDeleteQuery = SQL`
      DELETE FROM relationships_directed
      WHERE status = ${directedStatus.PENDING_FRIEND} AND 
        user1 IN (${userIDs}) AND user2 = ${viewer.userID}
    `;
    const undirectedInsertQuery = SQL`
      INSERT INTO relationships_undirected (user1, user2, status)
      VALUES ${undirectedRows}
      ON DUPLICATE KEY UPDATE status = VALUES(status)
    `;

    await Promise.all([
      dbQuery(directedInsertQuery),
      dbQuery(directedDeleteQuery),
      dbQuery(undirectedInsertQuery),
    ]);
  } else if (action === relationshipActions.UNBLOCK) {
    updateIDs.push(...userIDs);

    const query = SQL`
      DELETE FROM relationships_directed
      WHERE status = ${directedStatus.BLOCKED} AND 
        user1 = ${viewer.userID} AND user2 IN (${userIDs})
    `;
    await dbQuery(query);
  } else {
    invariant(false, `action ${action} is invalid or not supported currently`);
  }

  const time = Date.now();
  const updateDatas = [];
  for (const userID of updateIDs) {
    updateDatas.push({
      type: updateTypes.UPDATE_USER,
      userID,
      time,
      updatedUserID: viewer.userID,
    });
    updateDatas.push({
      type: updateTypes.UPDATE_USER,
      userID: viewer.userID,
      time,
      updatedUserID: userID,
    });
  }

  await createUpdates(updateDatas);

  return errors;
}

function sortIDs(firstId: string, secondId: string) {
  return [firstId, secondId].map(Number).sort((a, b) => a - b);
}

export { updateRelationships };

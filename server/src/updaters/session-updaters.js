// @flow

import type { Viewer } from '../session/viewer';
import type { CalendarQuery } from 'lib/types/entry-types';

import { dbQuery, SQL } from '../database/database';

export type SessionUpdate = $Shape<{|
  query: CalendarQuery,
  lastUpdate: number,
  lastValidated: number,
|}>;
async function commitSessionUpdate(
  viewer: Viewer,
  sessionUpdate: SessionUpdate,
): Promise<void> {
  const sqlUpdate = {};
  if (sessionUpdate.query) {
    sqlUpdate.query = JSON.stringify(sessionUpdate.query);
  }
  const { lastUpdate, lastValidated } = sessionUpdate;
  if (lastUpdate !== null && lastUpdate !== undefined) {
    sqlUpdate.last_update = lastUpdate;
  }
  if (lastValidated !== null && lastValidated !== undefined) {
    sqlUpdate.last_validated = lastValidated;
  }
  if (Object.keys(sqlUpdate).length === 0) {
    return;
  }

  viewer.setSessionInfo({
    lastValidated: sessionUpdate.lastValidated
      ? sessionUpdate.lastValidated
      : viewer.sessionLastValidated,
    calendarQuery: sessionUpdate.query
      ? sessionUpdate.query
      : viewer.calendarQuery,
  });

  const query = SQL`
    UPDATE sessions
    SET ${sqlUpdate}
    WHERE id = ${viewer.session}
  `;
  await dbQuery(query);
}

export { commitSessionUpdate };

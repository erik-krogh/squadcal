// @flow

import type { Viewer } from '../session/viewer';
import {
  type ReportCreationRequest,
  type ReportCreationResponse,
  type ThreadInconsistencyReportCreationRequest,
  type EntryInconsistencyReportCreationRequest,
  type UserInconsistencyReportCreationRequest,
  reportTypes,
} from 'lib/types/report-types';
import { messageTypes } from 'lib/types/message-types';

import bots from 'lib/facts/bots';
import _isEqual from 'lodash/fp/isEqual';

import {
  filterRawEntryInfosByCalendarQuery,
  serverEntryInfosObject,
} from 'lib/shared/entry-utils';
import { sanitizeAction, sanitizeState } from 'lib/utils/sanitization';
import { values } from 'lib/utils/objects';

import { dbQuery, SQL } from '../database';
import createIDs from './id-creator';
import { fetchUsername } from '../fetchers/user-fetchers';
import urlFacts from '../../facts/url';
import createMessages from './message-creator';
import { handleAsyncPromise } from '../responders/handlers';
import { createBotViewer } from '../session/bots';

const { baseDomain, basePath } = urlFacts;
const { squadbot } = bots;

async function createReport(
  viewer: Viewer,
  request: ReportCreationRequest,
): Promise<?ReportCreationResponse> {
  const shouldIgnore = await ignoreReport(viewer, request);
  if (shouldIgnore) {
    return null;
  }
  const [id] = await createIDs('reports', 1);
  let type, report, time;
  if (request.type === reportTypes.THREAD_INCONSISTENCY) {
    ({ type, time, ...report } = request);
    time = time ? time : Date.now();
  } else if (request.type === reportTypes.ENTRY_INCONSISTENCY) {
    ({ type, time, ...report } = request);
  } else if (request.type === reportTypes.MEDIA_MISSION) {
    ({ type, time, ...report } = request);
  } else if (request.type === reportTypes.USER_INCONSISTENCY) {
    ({ type, time, ...report } = request);
  } else {
    ({ type, ...report } = request);
    time = Date.now();
    report = {
      ...report,
      preloadedState: sanitizeState(report.preloadedState),
      currentState: sanitizeState(report.currentState),
      actions: report.actions.map(sanitizeAction),
    };
  }
  const row = [
    id,
    viewer.id,
    type,
    request.platformDetails.platform,
    JSON.stringify(report),
    time,
  ];
  const query = SQL`
    INSERT INTO reports (id, user, type, platform, report, creation_time)
    VALUES ${[row]}
  `;
  await dbQuery(query);
  handleAsyncPromise(sendSquadbotMessage(viewer, request, id));
  return { id };
}

async function sendSquadbotMessage(
  viewer: Viewer,
  request: ReportCreationRequest,
  reportID: string,
): Promise<void> {
  const canGenerateMessage = getSquadbotMessage(request, reportID, null);
  if (!canGenerateMessage) {
    return;
  }
  const username = await fetchUsername(viewer.id);
  const message = getSquadbotMessage(request, reportID, username);
  if (!message) {
    return;
  }
  const time = Date.now();
  await createMessages(createBotViewer(squadbot.userID), [
    {
      type: messageTypes.TEXT,
      threadID: squadbot.staffThreadID,
      creatorID: squadbot.userID,
      time,
      text: message,
    },
  ]);
}

async function ignoreReport(
  viewer: Viewer,
  request: ReportCreationRequest,
): Promise<boolean> {
  // The below logic is to avoid duplicate inconsistency reports
  if (
    request.type !== reportTypes.THREAD_INCONSISTENCY &&
    request.type !== reportTypes.ENTRY_INCONSISTENCY
  ) {
    return false;
  }
  const { type, platformDetails, time } = request;
  if (!time) {
    return false;
  }
  const { platform } = platformDetails;
  const query = SQL`
    SELECT id
    FROM reports
    WHERE user = ${viewer.id} AND type = ${type}
      AND platform = ${platform} AND creation_time = ${time}
  `;
  const [result] = await dbQuery(query);
  return result.length !== 0;
}

function getSquadbotMessage(
  request: ReportCreationRequest,
  reportID: string,
  username: ?string,
): ?string {
  const name = username ? username : '[null]';
  const { platformDetails } = request;
  const { platform, codeVersion } = platformDetails;
  const platformString = codeVersion ? `${platform} v${codeVersion}` : platform;
  if (request.type === reportTypes.ERROR) {
    return (
      `${name} got an error :(\n` +
      `using ${platformString}\n` +
      `${baseDomain}${basePath}download_error_report/${reportID}`
    );
  } else if (request.type === reportTypes.THREAD_INCONSISTENCY) {
    const nonMatchingThreadIDs = getInconsistentThreadIDsFromReport(request);
    const nonMatchingString = [...nonMatchingThreadIDs].join(', ');
    return (
      `system detected inconsistency for ${name}!\n` +
      `using ${platformString}\n` +
      `occurred during ${request.action.type}\n` +
      `thread IDs that are inconsistent: ${nonMatchingString}`
    );
  } else if (request.type === reportTypes.ENTRY_INCONSISTENCY) {
    const nonMatchingEntryIDs = getInconsistentEntryIDsFromReport(request);
    const nonMatchingString = [...nonMatchingEntryIDs].join(', ');
    return (
      `system detected inconsistency for ${name}!\n` +
      `using ${platformString}\n` +
      `occurred during ${request.action.type}\n` +
      `entry IDs that are inconsistent: ${nonMatchingString}`
    );
  } else if (request.type === reportTypes.USER_INCONSISTENCY) {
    const nonMatchingUserIDs = getInconsistentUserIDsFromReport(request);
    const nonMatchingString = [...nonMatchingUserIDs].join(', ');
    return (
      `system detected inconsistency for ${name}!\n` +
      `using ${platformString}\n` +
      `occurred during ${request.action.type}\n` +
      `user IDs that are inconsistent: ${nonMatchingString}`
    );
  } else if (request.type === reportTypes.MEDIA_MISSION) {
    const mediaMissionJSON = JSON.stringify(request.mediaMission);
    const success = request.mediaMission.result.success
      ? 'media mission success!'
      : 'media mission failed :(';
    return `${name} ${success}\n` + mediaMissionJSON;
  } else {
    return null;
  }
}

function findInconsistentObjectKeys(
  first: { [id: string]: Object },
  second: { [id: string]: Object },
): Set<string> {
  const nonMatchingIDs = new Set();
  for (let id in first) {
    if (!_isEqual(first[id])(second[id])) {
      nonMatchingIDs.add(id);
    }
  }
  for (let id in second) {
    if (!first[id]) {
      nonMatchingIDs.add(id);
    }
  }
  return nonMatchingIDs;
}

function getInconsistentThreadIDsFromReport(
  request: ThreadInconsistencyReportCreationRequest,
): Set<string> {
  const { pushResult, pollResult } = request;
  return findInconsistentObjectKeys(pollResult, pushResult);
}

function getInconsistentEntryIDsFromReport(
  request: EntryInconsistencyReportCreationRequest,
): Set<string> {
  const { pushResult, pollResult, calendarQuery } = request;
  const filteredPollResult = filterRawEntryInfosByCalendarQuery(
    serverEntryInfosObject(values(pollResult)),
    calendarQuery,
  );
  const filteredPushResult = filterRawEntryInfosByCalendarQuery(
    serverEntryInfosObject(values(pushResult)),
    calendarQuery,
  );
  return findInconsistentObjectKeys(filteredPollResult, filteredPushResult);
}

function getInconsistentUserIDsFromReport(
  request: UserInconsistencyReportCreationRequest,
): Set<string> {
  const { beforeStateCheck, afterStateCheck } = request;
  return findInconsistentObjectKeys(beforeStateCheck, afterStateCheck);
}

export default createReport;

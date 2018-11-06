// @flow

import type { WebSocket } from 'ws';
import type { $Request } from 'express';
import {
  type ClientSocketMessage,
  type InitialClientSocketMessage,
  type ResponsesClientSocketMessage,
  type ActivityUpdatesClientSocketMessage,
  type StateSyncFullSocketPayload,
  type ServerSocketMessage,
  type ErrorServerSocketMessage,
  type AuthErrorServerSocketMessage,
  type PingClientSocketMessage,
  type AckUpdatesClientSocketMessage,
  clientSocketMessageTypes,
  stateSyncPayloadTypes,
  serverSocketMessageTypes,
} from 'lib/types/socket-types';
import {
  cookieSources,
  sessionCheckFrequency,
  stateCheckInactivityActivationInterval,
} from 'lib/types/session-types';
import { defaultNumberPerThread } from 'lib/types/message-types';
import { serverRequestTypes } from 'lib/types/request-types';
import { redisMessageTypes, type RedisMessage } from 'lib/types/redis-types';

import t from 'tcomb';
import invariant from 'invariant';
import _debounce from 'lodash/debounce';

import { ServerError } from 'lib/utils/errors';
import { mostRecentMessageTimestamp } from 'lib/shared/message-utils';
import { mostRecentUpdateTimestamp } from 'lib/shared/update-utils';
import { promiseAll } from 'lib/utils/promises';
import { values } from 'lib/utils/objects';
import { serverRequestSocketTimeout } from 'lib/shared/timeouts';

import { Viewer } from '../session/viewer';
import {
  checkInputValidator,
  checkClientSupported,
  tShape,
  tCookie,
} from '../utils/validation-utils';
import {
  newEntryQueryInputValidator,
  verifyCalendarQueryThreadIDs,
} from '../responders/entry-responders';
import {
  clientResponseInputValidator,
  processClientResponses,
  initializeSession,
  checkState,
} from '../responders/ping-responders';
import { assertSecureRequest } from '../utils/security-utils';
import { fetchViewerForSocket, extendCookieLifespan } from '../session/cookies';
import {
  fetchMessageInfosSince,
  getMessageFetchResultFromRedisMessages,
} from '../fetchers/message-fetchers';
import { fetchThreadInfos } from '../fetchers/thread-fetchers';
import { fetchEntryInfos } from '../fetchers/entry-fetchers';
import { fetchCurrentUserInfo } from '../fetchers/user-fetchers';
import {
  updateActivityTime,
  activityUpdater,
} from '../updaters/activity-updaters';
import {
  deleteUpdatesBeforeTimeTargettingSession,
} from '../deleters/update-deleters';
import { fetchUpdateInfos } from '../fetchers/update-fetchers';
import { commitSessionUpdate } from '../updaters/session-updaters';
import { handleAsyncPromise } from '../responders/handlers';
import { deleteCookie } from '../deleters/cookie-deleters';
import { createNewAnonymousCookie } from '../session/cookies';
import { deleteActivityForViewerSession } from '../deleters/activity-deleters';
import {
  activityUpdatesInputValidator,
} from '../responders/activity-responders';
import { focusedTableRefreshFrequency } from '../shared/focused-times';
import { RedisSubscriber } from './redis';
import { fetchUpdateInfosWithRawUpdateInfos } from '../creators/update-creator';

const clientSocketMessageInputValidator = t.union([
  tShape({
    type: t.irreducible(
      'clientSocketMessageTypes.INITIAL',
      x => x === clientSocketMessageTypes.INITIAL,
    ),
    id: t.Number,
    payload: tShape({
      sessionIdentification: tShape({
        cookie: t.maybe(tCookie),
        sessionID: t.maybe(t.String),
      }),
      sessionState: tShape({
        calendarQuery: newEntryQueryInputValidator,
        messagesCurrentAsOf: t.Number,
        updatesCurrentAsOf: t.Number,
        watchedIDs: t.list(t.String),
      }),
      clientResponses: t.list(clientResponseInputValidator),
    }),
  }),
  tShape({
    type: t.irreducible(
      'clientSocketMessageTypes.RESPONSES',
      x => x === clientSocketMessageTypes.RESPONSES,
    ),
    id: t.Number,
    payload: tShape({
      clientResponses: t.list(clientResponseInputValidator),
    }),
  }),
  tShape({
    type: t.irreducible(
      'clientSocketMessageTypes.ACTIVITY_UPDATES',
      x => x === clientSocketMessageTypes.ACTIVITY_UPDATES,
    ),
    id: t.Number,
    payload: tShape({
      activityUpdates: activityUpdatesInputValidator,
    }),
  }),
  tShape({
    type: t.irreducible(
      'clientSocketMessageTypes.PING',
      x => x === clientSocketMessageTypes.PING,
    ),
    id: t.Number,
  }),
  tShape({
    type: t.irreducible(
      'clientSocketMessageTypes.ACK_UPDATES',
      x => x === clientSocketMessageTypes.ACK_UPDATES,
    ),
    id: t.Number,
    payload: tShape({
      currentAsOf: t.Number,
    }),
  }),
]);

function onConnection(ws: WebSocket, req: $Request) {
  assertSecureRequest(req);
  new Socket(ws, req);
}

type StateCheckConditions = {|
  activityRecentlyOccurred: bool,
  stateCheckOngoing: bool,
|};

class Socket {

  ws: WebSocket;
  httpRequest: $Request;
  viewer: ?Viewer;
  redis: ?RedisSubscriber;

  updateActivityTimeIntervalID: ?IntervalID;

  stateCheckConditions: StateCheckConditions = {
    activityRecentlyOccurred: true,
    stateCheckOngoing: false,
  };
  stateCheckTimeoutID: ?TimeoutID;

  constructor(ws: WebSocket, httpRequest: $Request) {
    this.ws = ws;
    this.httpRequest = httpRequest;
    ws.on('message', this.onMessage);
    ws.on('close', this.onClose);
    this.resetTimeout();
  }

  onMessage = async (messageString: string) => {
    let clientSocketMessage: ?ClientSocketMessage;
    try {
      this.resetTimeout();
      const message = JSON.parse(messageString);
      checkInputValidator(clientSocketMessageInputValidator, message);
      clientSocketMessage = message;
      if (clientSocketMessage.type === clientSocketMessageTypes.INITIAL) {
        if (this.viewer) {
          // This indicates that the user sent multiple INITIAL messages.
          throw new ServerError('socket_already_initialized');
        }
        this.viewer = await fetchViewerForSocket(
          this.httpRequest,
          clientSocketMessage,
        );
        if (!this.viewer) {
          // This indicates that the cookie was invalid, but the client is using
          // cookieSources.HEADER and thus can't accept a new cookie over
          // WebSockets. See comment under catch block for socket_deauthorized.
          throw new ServerError('socket_deauthorized');
        }
      }
      const { viewer } = this;
      if (!viewer) {
        // This indicates a non-INITIAL message was sent by the client before
        // the INITIAL message.
        throw new ServerError('socket_uninitialized');
      }
      if (viewer.sessionChanged) {
        // This indicates that the cookie was invalid, and we've assigned a new
        // anonymous one.
        throw new ServerError('socket_deauthorized');
      }
      if (!viewer.loggedIn) {
        // This indicates that the specified cookie was an anonymous one.
        throw new ServerError('not_logged_in');
      }
      await checkClientSupported(
        viewer,
        clientSocketMessageInputValidator,
        clientSocketMessage,
      );
      if (!this.redis) {
        this.redis = new RedisSubscriber(
          { userID: viewer.userID, sessionID: viewer.session },
          this.onRedisMessage,
        );
      }
      const serverResponses = await this.handleClientSocketMessage(
        clientSocketMessage,
      );
      if (viewer.sessionChanged) {
        // This indicates that something has caused the session to change, which
        // shouldn't happen from inside a WebSocket since we can't handle cookie
        // invalidation.
        throw new ServerError('session_mutated_from_socket');
      }
      handleAsyncPromise(extendCookieLifespan(viewer.cookieID));
      for (let response of serverResponses) {
        this.sendMessage(response);
      }
      if (clientSocketMessage.type === clientSocketMessageTypes.INITIAL) {
        this.onSuccessfulConnection();
      }
    } catch (error) {
      console.warn(error);
      if (!(error instanceof ServerError)) {
        const errorMessage: ErrorServerSocketMessage = {
          type: serverSocketMessageTypes.ERROR,
          message: error.message,
        };
        const responseTo = clientSocketMessage ? clientSocketMessage.id : null;
        if (responseTo !== null) {
          errorMessage.responseTo = responseTo;
        }
        this.markActivityOccurred();
        this.sendMessage(errorMessage);
        return;
      }
      invariant(clientSocketMessage, "should be set");
      const responseTo = clientSocketMessage.id;
      if (error.message === "socket_deauthorized") {
        const authErrorMessage: AuthErrorServerSocketMessage = {
          type: serverSocketMessageTypes.AUTH_ERROR,
          responseTo,
          message: error.message,
        }
        if (this.viewer) {
          // viewer should only be falsey for cookieSources.HEADER (web)
          // clients. Usually if the cookie is invalid we construct a new
          // anonymous Viewer with a new cookie, and then pass the cookie down
          // in the error. But we can't pass HTTP cookies in WebSocket messages.
          authErrorMessage.sessionChange = {
            cookie: this.viewer.cookiePairString,
            currentUserInfo: {
              id: this.viewer.cookieID,
              anonymous: true,
            },
          };
        }
        this.sendMessage(authErrorMessage);
        this.ws.close(4100, error.message);
        return;
      } else if (error.message === "client_version_unsupported") {
        const { viewer } = this;
        invariant(viewer, "should be set");
        const promises = {};
        promises.deleteCookie = deleteCookie(viewer.cookieID);
        if (viewer.cookieSource !== cookieSources.BODY) {
          promises.anonymousViewerData = createNewAnonymousCookie({
            platformDetails: error.platformDetails,
            deviceToken: viewer.deviceToken,
          });
        }
        const { anonymousViewerData } = await promiseAll(promises);
        const authErrorMessage: AuthErrorServerSocketMessage = {
          type: serverSocketMessageTypes.AUTH_ERROR,
          responseTo,
          message: error.message,
        }
        if (anonymousViewerData) {
          const anonViewer = new Viewer(anonymousViewerData);
          authErrorMessage.sessionChange = {
            cookie: anonViewer.cookiePairString,
            currentUserInfo: {
              id: anonViewer.cookieID,
              anonymous: true,
            },
          };
        }
        this.sendMessage(authErrorMessage);
        this.ws.close(4101, error.message);
        return;
      }
      this.sendMessage({
        type: serverSocketMessageTypes.ERROR,
        responseTo,
        message: error.message,
      });
      if (error.message === "not_logged_in") {
        this.ws.close(4102, error.message);
      } else if (error.message === "session_mutated_from_socket") {
        this.ws.close(4103, error.message);
      } else {
        this.markActivityOccurred();
      }
    }
  }

  onClose = async () => {
    if (this.updateActivityTimeIntervalID) {
      clearInterval(this.updateActivityTimeIntervalID);
      this.updateActivityTimeIntervalID = null;
    }
    this.clearStateCheckTimeout();
    this.resetTimeout.cancel();
    this.debouncedAfterActivity.cancel();
    if (this.viewer && this.viewer.hasSessionInfo) {
      await deleteActivityForViewerSession(this.viewer);
    }
    if (this.redis) {
      this.redis.quit();
      this.redis = null;
    }
  }

  sendMessage(message: ServerSocketMessage) {
    invariant(
      this.ws.readyState > 0,
      "shouldn't send message until connection established",
    );
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(message));
    }
  }

  async handleClientSocketMessage(
    message: ClientSocketMessage,
  ): Promise<ServerSocketMessage[]> {
    if (message.type === clientSocketMessageTypes.INITIAL) {
      this.markActivityOccurred();
      return await this.handleInitialClientSocketMessage(message);
    } else if (message.type === clientSocketMessageTypes.RESPONSES) {
      this.markActivityOccurred();
      return await this.handleResponsesClientSocketMessage(message);
    } else if (message.type === clientSocketMessageTypes.ACTIVITY_UPDATES) {
      this.markActivityOccurred();
      return await this.handleActivityUpdatesClientSocketMessage(message);
    } else if (message.type === clientSocketMessageTypes.PING) {
      return await this.handlePingClientSocketMessage(message);
    } else if (message.type === clientSocketMessageTypes.ACK_UPDATES) {
      this.markActivityOccurred();
      return await this.handleAckUpdatesClientSocketMessage(message);
    }
    return [];
  }

  async handleInitialClientSocketMessage(
    message: InitialClientSocketMessage,
  ): Promise<ServerSocketMessage[]> {
    const { viewer } = this;
    invariant(viewer, "should be set");

    const responses = [];

    const { sessionState, clientResponses } = message.payload;
    const {
      calendarQuery,
      updatesCurrentAsOf: oldUpdatesCurrentAsOf,
      messagesCurrentAsOf: oldMessagesCurrentAsOf,
      watchedIDs,
    } = sessionState;
    await verifyCalendarQueryThreadIDs(calendarQuery);

    const sessionInitializationResult = await initializeSession(
      viewer,
      calendarQuery,
      oldUpdatesCurrentAsOf,
    );

    const threadCursors = {};
    for (let watchedThreadID of watchedIDs) {
      threadCursors[watchedThreadID] = null;
    }
    const threadSelectionCriteria = { threadCursors, joinedThreads: true };
    const [
      fetchMessagesResult,
      { serverRequests, activityUpdateResult },
    ] = await Promise.all([
      fetchMessageInfosSince(
        viewer,
        threadSelectionCriteria,
        oldMessagesCurrentAsOf,
        defaultNumberPerThread,
      ),
      processClientResponses(
        viewer,
        clientResponses,
      ),
    ]);
    const messagesResult = {
      rawMessageInfos: fetchMessagesResult.rawMessageInfos,
      truncationStatuses: fetchMessagesResult.truncationStatuses,
      currentAsOf: mostRecentMessageTimestamp(
        fetchMessagesResult.rawMessageInfos,
        oldMessagesCurrentAsOf,
      ),
    };

    if (!sessionInitializationResult.sessionContinued) {
      const [
        threadsResult,
        entriesResult,
        currentUserInfo,
      ] = await Promise.all([
        fetchThreadInfos(viewer),
        fetchEntryInfos(viewer, [ calendarQuery ]),
        fetchCurrentUserInfo(viewer),
      ]);
      const payload: StateSyncFullSocketPayload = {
        type: stateSyncPayloadTypes.FULL,
        messagesResult,
        threadInfos: threadsResult.threadInfos,
        currentUserInfo,
        rawEntryInfos: entriesResult.rawEntryInfos,
        userInfos: values({
          ...fetchMessagesResult.userInfos,
          ...entriesResult.userInfos,
          ...threadsResult.userInfos,
        }),
        updatesCurrentAsOf: oldUpdatesCurrentAsOf,
      };
      if (viewer.sessionChanged) {
        // If initializeSession encounters sessionIdentifierTypes.BODY_SESSION_ID,
        // but the session is unspecified or expired, it will set a new sessionID
        // and specify viewer.sessionChanged
        const { sessionID } = viewer;
        invariant(sessionID !== null && sessionID !== undefined, "should be set");
        payload.sessionID = sessionID;
        viewer.sessionChanged = false;
      }
      responses.push({
        type: serverSocketMessageTypes.STATE_SYNC,
        responseTo: message.id,
        payload,
      });
    } else {
      const {
        sessionUpdate,
        deltaEntryInfoResult,
      } = sessionInitializationResult;

      const promises = {};
      promises.activityUpdate = updateActivityTime(viewer);
      promises.deleteExpiredUpdates = deleteUpdatesBeforeTimeTargettingSession(
        viewer,
        oldUpdatesCurrentAsOf,
      );
      promises.fetchUpdateResult = fetchUpdateInfos(
        viewer,
        oldUpdatesCurrentAsOf,
        calendarQuery,
      );
      promises.sessionUpdate = commitSessionUpdate(viewer, sessionUpdate);
      const { fetchUpdateResult } = await promiseAll(promises);

      const updateUserInfos = fetchUpdateResult.userInfos;
      const { updateInfos } = fetchUpdateResult;
      const newUpdatesCurrentAsOf = mostRecentUpdateTimestamp(
        [...updateInfos],
        oldUpdatesCurrentAsOf,
      );
      const updatesResult = {
        newUpdates: updateInfos,
        currentAsOf: newUpdatesCurrentAsOf,
      };

      responses.push({
        type: serverSocketMessageTypes.STATE_SYNC,
        responseTo: message.id,
        payload: {
          type: stateSyncPayloadTypes.INCREMENTAL,
          messagesResult,
          updatesResult,
          deltaEntryInfos: deltaEntryInfoResult.rawEntryInfos,
          userInfos: values({
            ...fetchMessagesResult.userInfos,
            ...updateUserInfos,
            ...deltaEntryInfoResult.userInfos,
          }),
        },
      });
    }

    // Clients that support sockets always keep their server aware of their
    // device token, without needing any requests
    const filteredServerRequests = serverRequests.filter(
      request => request.type !== serverRequestTypes.DEVICE_TOKEN &&
        request.type !== serverRequestTypes.INITIAL_ACTIVITY_UPDATES,
    );
    if (filteredServerRequests.length > 0 || clientResponses.length > 0) {
      // We send this message first since the STATE_SYNC triggers the client's
      // connection status to shift to "connected", and we want to make sure the
      // client responses are cleared from Redux before that happens
      responses.unshift({
        type: serverSocketMessageTypes.REQUESTS,
        responseTo: message.id,
        payload: { serverRequests: filteredServerRequests },
      });
    }

    if (activityUpdateResult) {
      // Same reason for unshifting as above
      responses.unshift({
        type: serverSocketMessageTypes.ACTIVITY_UPDATE_RESPONSE,
        responseTo: message.id,
        payload: activityUpdateResult,
      });
    }

    return responses;
  }

  async handleResponsesClientSocketMessage(
    message: ResponsesClientSocketMessage,
  ): Promise<ServerSocketMessage[]> {
    const { viewer } = this;
    invariant(viewer, "should be set");

    const { clientResponses } = message.payload;
    const { stateCheckStatus } = await processClientResponses(
      viewer,
      clientResponses,
    );

    const serverRequests = [];
    if (stateCheckStatus && stateCheckStatus.status !== "state_check") {
      const { sessionUpdate, checkStateRequest } = await checkState(
        viewer,
        stateCheckStatus,
        viewer.calendarQuery,
      );
      if (sessionUpdate) {
        await commitSessionUpdate(viewer, sessionUpdate);
        this.setStateCheckConditions({ stateCheckOngoing: false });
      }
      if (checkStateRequest) {
        serverRequests.push(checkStateRequest);
      }
    }

    // We send a response message regardless of whether we have any requests,
    // since we need to ack the client's responses
    return [{
      type: serverSocketMessageTypes.REQUESTS,
      responseTo: message.id,
      payload: { serverRequests },
    }];
  }

  async handleActivityUpdatesClientSocketMessage(
    message: ActivityUpdatesClientSocketMessage,
  ): Promise<ServerSocketMessage[]> {
    const { viewer } = this;
    invariant(viewer, "should be set");
    const result = await activityUpdater(
      viewer,
      { updates: message.payload.activityUpdates },
    );
    return [{
      type: serverSocketMessageTypes.ACTIVITY_UPDATE_RESPONSE,
      responseTo: message.id,
      payload: result,
    }];
  }

  async handlePingClientSocketMessage(
    message: PingClientSocketMessage,
  ): Promise<ServerSocketMessage[]> {
    return [{
      type: serverSocketMessageTypes.PONG,
      responseTo: message.id,
    }];
  }

  async handleAckUpdatesClientSocketMessage(
    message: AckUpdatesClientSocketMessage,
  ): Promise<ServerSocketMessage[]> {
    const { viewer } = this;
    invariant(viewer, "should be set");
    const { currentAsOf } = message.payload;
    await Promise.all([
      deleteUpdatesBeforeTimeTargettingSession(viewer, currentAsOf),
      commitSessionUpdate(viewer, { lastUpdate: currentAsOf }),
    ]);
    return [];
  }

  onRedisMessage = async (message: RedisMessage) => {
    try {
      await this.processRedisMessage(message);
    } catch (e) {
      console.warn(e);
    }
  }

  async processRedisMessage(message: RedisMessage) {
    if (message.type === redisMessageTypes.START_SUBSCRIPTION) {
      this.ws.terminate();
    } else if (message.type === redisMessageTypes.NEW_UPDATES) {
      const { viewer } = this;
      invariant(viewer, "should be set");
      const rawUpdateInfos = message.updates;
      const {
        updateInfos,
        userInfos,
      } = await fetchUpdateInfosWithRawUpdateInfos(
        rawUpdateInfos,
        { viewer },
      );
      if (updateInfos.length === 0) {
        console.warn(
          "could not get any UpdateInfos from redisMessageTypes.NEW_UPDATES",
        );
        return;
      }
      this.markActivityOccurred();
      this.sendMessage({
        type: serverSocketMessageTypes.UPDATES,
        payload: {
          updatesResult: {
            currentAsOf: mostRecentUpdateTimestamp([...updateInfos], 0),
            newUpdates: updateInfos,
          },
          userInfos: values(userInfos),
        },
      });
    } else if (message.type === redisMessageTypes.NEW_MESSAGES) {
      const { viewer } = this;
      invariant(viewer, "should be set");
      const rawMessageInfos = message.messages;
      const messageFetchResult = await getMessageFetchResultFromRedisMessages(
        viewer,
        rawMessageInfos,
      );
      if (messageFetchResult.rawMessageInfos.length === 0) {
        console.warn(
          "could not get any rawMessageInfos from " +
            "redisMessageTypes.NEW_MESSAGES",
        );
        return;
      }
      this.markActivityOccurred();
      this.sendMessage({
        type: serverSocketMessageTypes.MESSAGES,
        payload: {
          messagesResult: {
            rawMessageInfos: messageFetchResult.rawMessageInfos,
            truncationStatuses: messageFetchResult.truncationStatuses,
            currentAsOf: mostRecentMessageTimestamp(
              messageFetchResult.rawMessageInfos,
              0,
            ),
          },
          userInfos: values(messageFetchResult.userInfos),
        },
      });
    }
  }

  onSuccessfulConnection() {
    this.updateActivityTimeIntervalID = setInterval(
      this.updateActivityTime,
      focusedTableRefreshFrequency,
    );
    this.handleStateCheckConditionsUpdate();
  }

  updateActivityTime = () => {
    const { viewer } = this;
    invariant(viewer, "should be set");
    handleAsyncPromise(updateActivityTime(viewer));
  }

  // The Socket will timeout by calling this.ws.terminate()
  // serverRequestSocketTimeout milliseconds after the last
  // time resetTimeout is called
  resetTimeout = _debounce(
    () => this.ws.terminate(),
    serverRequestSocketTimeout,
  )

  debouncedAfterActivity = _debounce(
    () => this.setStateCheckConditions({ activityRecentlyOccurred: false }),
    stateCheckInactivityActivationInterval,
  )

  markActivityOccurred = () => {
    this.setStateCheckConditions({ activityRecentlyOccurred: true });
    this.debouncedAfterActivity();
  }

  clearStateCheckTimeout() {
    if (this.stateCheckTimeoutID) {
      clearTimeout(this.stateCheckTimeoutID);
      this.stateCheckTimeoutID = null;
    }
  }

  setStateCheckConditions(newConditions: $Shape<StateCheckConditions>) {
    this.stateCheckConditions = {
      ...this.stateCheckConditions,
      ...newConditions,
    };
    this.handleStateCheckConditionsUpdate();
  }

  get stateCheckCanStart() {
    return Object.values(this.stateCheckConditions).every(cond => !cond);
  }

  handleStateCheckConditionsUpdate() {
    if (!this.stateCheckCanStart) {
      this.clearStateCheckTimeout();
      return;
    }
    if (this.stateCheckTimeoutID) {
      return;
    }
    const { viewer } = this;
    if (!viewer) {
      return;
    }
    const timeUntilStateCheck =
      viewer.sessionLastValidated + sessionCheckFrequency - Date.now();
    if (timeUntilStateCheck <= 0) {
      this.initiateStateCheck();
    } else {
      this.stateCheckTimeoutID = setTimeout(
        this.initiateStateCheck,
        timeUntilStateCheck,
      );
    }
  }

  initiateStateCheck = async () => {
    this.setStateCheckConditions({ stateCheckOngoing: true });

    const { viewer } = this;
    invariant(viewer, "should be set");

    const { checkStateRequest } = await checkState(
      viewer,
      { status: "state_check" },
      viewer.calendarQuery,
    );
    invariant(checkStateRequest, "should be set");

    this.sendMessage({
      type: serverSocketMessageTypes.REQUESTS,
      payload: { serverRequests: [ checkStateRequest ] },
    });
  }

}

export {
  onConnection,
};
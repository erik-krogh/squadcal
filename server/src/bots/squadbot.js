// @flow

import { threadTypes } from 'lib/types/thread-types';

import invariant from 'invariant';

import bots from 'lib/facts/bots';

import { createBotViewer } from '../session/bots';
import createThread from '../creators/thread-creator';

const { squadbot } = bots;

async function createSquadbotThread(userID: string): Promise<string> {
  const squadbotViewer = createBotViewer(squadbot.userID);
  const newThreadRequest = {
    type: threadTypes.CHAT_SECRET,
    initialMemberIDs: [userID],
  };
  const result = await createThread(squadbotViewer, newThreadRequest, true);
  const { newThreadID } = result;
  invariant(
    newThreadID,
    'createThread should return newThreadID to bot viewer',
  );
  return newThreadID;
}

export { createSquadbotThread };

// @flow

import * as React from 'react';
import { useDispatch } from 'react-redux';

import { messageStorePruneActionType } from 'lib/actions/message-actions';

import {
  nextMessagePruneTimeSelector,
  pruneThreadIDsSelector,
} from '../selectors/message-selectors';
import { NavContext } from '../navigation/navigation-context';
import { useSelector } from '../redux/redux-utils';

function MessageStorePruner() {
  const nextMessagePruneTime = useSelector(nextMessagePruneTimeSelector);
  const prevNextMessagePruneTimeRef = React.useRef(nextMessagePruneTime);

  const foreground = useSelector((state) => state.foreground);
  const frozen = useSelector((state) => state.frozen);

  const navContext = React.useContext(NavContext);
  const pruneThreadIDs = useSelector((state) =>
    pruneThreadIDsSelector({
      redux: state,
      navContext,
    }),
  );

  const prunedRef = React.useRef(false);

  const dispatch = useDispatch();

  React.useEffect(() => {
    if (
      prunedRef.current &&
      nextMessagePruneTime !== prevNextMessagePruneTimeRef.current
    ) {
      prunedRef.current = false;
    }
    prevNextMessagePruneTimeRef.current = nextMessagePruneTime;

    if (frozen || prunedRef.current) {
      return;
    }
    if (nextMessagePruneTime === null || nextMessagePruneTime === undefined) {
      return;
    }
    const timeUntilExpiration = nextMessagePruneTime - Date.now();
    if (timeUntilExpiration > 0) {
      return;
    }
    const threadIDs = pruneThreadIDs();
    if (threadIDs.length === 0) {
      return;
    }
    prunedRef.current = true;
    dispatch({
      type: messageStorePruneActionType,
      payload: { threadIDs },
    });
    // We include foreground so this effect will be called on foreground
  }, [nextMessagePruneTime, frozen, foreground, pruneThreadIDs, dispatch]);

  return null;
}

export default MessageStorePruner;

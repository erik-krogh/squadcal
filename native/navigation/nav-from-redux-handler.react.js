// @flow

import * as React from 'react';
import { useSelector } from 'react-redux';

import { NavContext } from './navigation-context';
import { setNavStateActionType } from './action-types';

const NavFromReduxHandler = React.memo<{||}>(() => {
  const navContext = React.useContext(NavContext);

  const navStateInRedux = useSelector((state) => state.navState);

  const dispatch = React.useMemo(() => {
    if (!navContext) {
      return null;
    }
    return navContext.dispatch;
  }, [navContext]);

  React.useEffect(() => {
    if (!dispatch) {
      return;
    }
    if (navStateInRedux) {
      dispatch({
        type: setNavStateActionType,
        payload: { state: navStateInRedux },
      });
    }
  }, [dispatch, navStateInRedux]);

  return null;
});
NavFromReduxHandler.displayName = 'NavFromReduxHandler';

export default NavFromReduxHandler;

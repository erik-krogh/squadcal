// @flow

import type { ThreadInfo } from 'lib/types/thread-types';
import { threadInfoPropType } from 'lib/types/thread-types';
import {
  type EntryInfo,
  entryInfoPropType,
  type RestoreEntryInfo,
  type RestoreEntryResponse,
  type CalendarQuery,
} from 'lib/types/entry-types';
import type { AppState } from '../../redux/redux-setup';
import type { LoadingStatus } from 'lib/types/loading-types';
import type { DispatchActionPromise } from 'lib/utils/action-utils';

import * as React from 'react';
import classNames from 'classnames';
import invariant from 'invariant';
import PropTypes from 'prop-types';

import { colorIsDark } from 'lib/shared/thread-utils';
import {
  restoreEntryActionTypes,
  restoreEntry,
} from 'lib/actions/entry-actions';
import { createLoadingStatusSelector } from 'lib/selectors/loading-selectors';
import { connect } from 'lib/utils/redux-utils';
import { threadInfoSelector } from 'lib/selectors/thread-selectors';

import css from './history.css';
import LoadingIndicator from '../../loading-indicator.react';
import { nonThreadCalendarQuery } from '../../selectors/nav-selectors';

type Props = {
  entryInfo: EntryInfo,
  onClick: (entryID: string) => void,
  animateAndLoadEntry: (entryID: string) => void,
  // Redux state
  threadInfo: ThreadInfo,
  loggedIn: boolean,
  restoreLoadingStatus: LoadingStatus,
  calendarQuery: () => CalendarQuery,
  // Redux dispatch functions
  dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  restoreEntry: (info: RestoreEntryInfo) => Promise<RestoreEntryResponse>,
};

class HistoryEntry extends React.PureComponent<Props> {
  render() {
    let deleted = null;
    if (this.props.entryInfo.deleted) {
      let restore = null;
      if (this.props.loggedIn) {
        restore = (
          <span>
            <span className={css.restoreEntryLabel}>
              (
              <a href="#" onClick={this.onRestore}>
                restore
              </a>
              )
            </span>
            <LoadingIndicator
              status={this.props.restoreLoadingStatus}
              color="black"
              loadingClassName={css.restoreLoading}
              errorClassName={css.restoreError}
            />
          </span>
        );
      }
      deleted = (
        <span className={css.deletedEntry}>
          <span className={css.deletedEntryLabel}>deleted</span>
          {restore}
        </span>
      );
    }

    const textClasses = classNames({
      [css.entry]: true,
      [css.darkEntry]: colorIsDark(this.props.threadInfo.color),
    });
    const textStyle = { backgroundColor: '#' + this.props.threadInfo.color };
    const creator =
      this.props.entryInfo.creator === null ? (
        'Anonymous'
      ) : (
        <span className={css.entryUsername}>
          {this.props.entryInfo.creator}
        </span>
      );

    return (
      <li>
        <div className={textClasses} style={textStyle}>
          {this.props.entryInfo.text}
        </div>
        <span className={css.entryAuthor}>
          {'created by '}
          {creator}
        </span>
        <span className={css.entryThread}>{this.props.threadInfo.uiName}</span>
        <div className={css.clear} />
        {deleted}
        <a
          href="#"
          className={css.revisionHistoryButton}
          onClick={this.onClick}
        >
          revision history &gt;
        </a>
        <div className={css.clear} />
      </li>
    );
  }

  onRestore = (event: SyntheticEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const entryID = this.props.entryInfo.id;
    invariant(entryID, 'entryInfo.id (serverID) should be set');
    this.props.dispatchActionPromise(
      restoreEntryActionTypes,
      this.restoreEntryAction(),
      { customKeyName: `${restoreEntryActionTypes.started}:${entryID}` },
    );
  };

  onClick = (event: SyntheticEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const entryID = this.props.entryInfo.id;
    invariant(entryID, 'entryInfo.id (serverID) should be set');
    this.props.onClick(entryID);
  };

  async restoreEntryAction() {
    const entryID = this.props.entryInfo.id;
    invariant(entryID, 'entry should have ID');
    const result = await this.props.restoreEntry({
      entryID,
      calendarQuery: this.props.calendarQuery(),
    });
    this.props.animateAndLoadEntry(entryID);
    return { ...result, threadID: this.props.threadInfo.id };
  }
}

HistoryEntry.propTypes = {
  entryInfo: entryInfoPropType,
  onClick: PropTypes.func.isRequired,
  animateAndLoadEntry: PropTypes.func.isRequired,
  threadInfo: threadInfoPropType,
  loggedIn: PropTypes.bool.isRequired,
  restoreLoadingStatus: PropTypes.string.isRequired,
  calendarQuery: PropTypes.func.isRequired,
  dispatchActionPromise: PropTypes.func.isRequired,
  restoreEntry: PropTypes.func.isRequired,
};

export default connect(
  (state: AppState, ownProps: { entryInfo: EntryInfo }) => {
    const entryID = ownProps.entryInfo.id;
    invariant(entryID, 'entryInfo.id (serverID) should be set');
    return {
      threadInfo: threadInfoSelector(state)[ownProps.entryInfo.threadID],
      loggedIn: !!(
        state.currentUserInfo &&
        !state.currentUserInfo.anonymous &&
        true
      ),
      restoreLoadingStatus: createLoadingStatusSelector(
        restoreEntryActionTypes,
        `${restoreEntryActionTypes.started}:${entryID}`,
      )(state),
      calendarQuery: nonThreadCalendarQuery(state),
    };
  },
  { restoreEntry },
)(HistoryEntry);

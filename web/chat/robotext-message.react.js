// @flow

import {
  type ChatMessageInfoItem,
  chatMessageItemPropType,
} from 'lib/selectors/chat-selectors';
import { messageTypes } from 'lib/types/message-types';
import type { DispatchActionPayload } from 'lib/utils/action-utils';
import {
  type AppState,
  type NavInfo,
  navInfoPropType,
  updateNavInfoActionType,
} from '../redux-setup';
import { type ThreadInfo, threadInfoPropType } from 'lib/types/thread-types';

import * as React from 'react';
import invariant from 'invariant';
import Linkify from 'react-linkify';
import PropTypes from 'prop-types';

import { splitRobotext, parseRobotextEntity } from 'lib/shared/message-utils';
import { threadInfoSelector } from 'lib/selectors/thread-selectors';
import { connect } from 'lib/utils/redux-utils';

import css from './chat-message-list.css';

type Props = {|
  item: ChatMessageInfoItem,
|};
class RobotextMessage extends React.PureComponent<Props> {

  static propTypes = {
    item: chatMessageItemPropType.isRequired,
  };

  constructor(props: Props) {
    super(props);
    invariant(
      props.item.messageInfo.type !== messageTypes.TEXT,
      "TextMessage cannot be used for messageTypes.TEXT",
    );
  }

  componentWillReceiveProps(nextProps: Props) {
    invariant(
      nextProps.item.messageInfo.type !== messageTypes.TEXT,
      "TextMessage cannot be used for messageTypes.TEXT",
    );
  }

  render() {
    return (
      <div className={css.robotext}>
        {this.linkedRobotext()}
      </div>
    );
  }

  linkedRobotext() {
    const item = this.props.item;
    invariant(
      item.robotext && typeof item.robotext === "string",
      "Flow can't handle our fancy types :(",
    );
    const robotext = item.robotext;
    const robotextParts = splitRobotext(robotext);
    const textParts = [];
    for (let splitPart of robotextParts) {
      if (splitPart === "") {
        continue;
      }
      if (splitPart.charAt(0) !== "<") {
        textParts.push(decodeURI(splitPart));
        continue;
      }

      const { rawText, entityType, id } = parseRobotextEntity(splitPart);

      if (entityType === "t" && id !== this.props.item.messageInfo.threadID) {
        textParts.push(<ThreadEntity key={id} id={id} name={rawText} />);
      } else if (entityType === "c") {
        textParts.push(<ColorEntity key={id} color={rawText} />);
      } else {
        textParts.push(rawText);
      }
    }

    return (
      <Linkify>
        {textParts}
      </Linkify>
    );
  }

}

type InnerThreadEntityProps = {
  id: string,
  name: string,
  // Redux state
  threadInfo: ThreadInfo,
  navInfo: NavInfo,
  // Redux dispatch functions
  dispatchActionPayload: DispatchActionPayload,
};
class InnerThreadEntity extends React.PureComponent<InnerThreadEntityProps> {

  static propTypes = {
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    threadInfo: threadInfoPropType.isRequired,
    navInfo: navInfoPropType.isRequired,
    dispatchActionPayload: PropTypes.func.isRequired,
  };

  render() {
    return (
      <a onClick={this.onClickThread}>
        {this.props.name}
      </a>
    );
  }

  onClickThread = (event: SyntheticEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const id = this.props.id;
    this.props.dispatchActionPayload(
      updateNavInfoActionType,
      {
        ...this.props.navInfo,
        activeChatThreadID: id,
      },
    );
  }

}
const ThreadEntity = connect(
  (state: AppState, ownProps: { id: string }) => ({
    threadInfo: threadInfoSelector(state)[ownProps.id],
    navInfo: state.navInfo,
  }),
  null,
  true,
)(InnerThreadEntity);

function ColorEntity(props: {| color: string |}) {
  const colorStyle = { color: props.color };
  return <span style={colorStyle}>{props.color}</span>;
}

export default RobotextMessage;

// @flow

import {
  type ChatMessageInfoItem,
  chatMessageItemPropType,
} from 'lib/selectors/chat-selectors';
import { messageTypes } from 'lib/types/message-types';

import * as React from 'react';

import { longAbsoluteDate } from 'lib/utils/date-utils';

import TextMessage from './text-message.react';
import RobotextMessage from './robotext-message.react';
import css from './chat-message-list.css';

type Props = {|
  item: ChatMessageInfoItem,
|};
class Message extends React.PureComponent<Props> {

  static propTypes = {
    item: chatMessageItemPropType.isRequired,
  };

  render() {
    let conversationHeader = null;
    if (this.props.item.startsConversation) {
      conversationHeader = (
        <div className={css.conversationHeader}>
          {longAbsoluteDate(this.props.item.messageInfo.time)}
        </div>
      );
    }
    const message = this.props.item.messageInfo.type === messageTypes.TEXT
      ? <TextMessage item={this.props.item} />
      : <RobotextMessage item={this.props.item} />;
    return (
      <React.Fragment>
        {message}
        {conversationHeader}
      </React.Fragment>
    );
  }

}

export default Message;

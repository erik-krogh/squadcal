// @flow

import type { ChatMessageInfoItemWithHeight } from './message.react';
import { chatMessageItemPropType } from 'lib/selectors/chat-selectors';
import { assertComposableMessageType } from 'lib/types/message-types';
import type { AppState } from '../redux/redux-setup';

import * as React from 'react';
import PropTypes from 'prop-types';
import { StyleSheet, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import invariant from 'invariant';

import { connect } from 'lib/utils/redux-utils';

import SwipeableMessage from '../components/swipeable-message.react';
import { FailedSend } from './failed-send.react';
import { composedMessageMaxWidthSelector } from './composed-message-width';
import { MessageHeader } from './message-header.react';
import { type Colors, colorsPropType, colorsSelector } from '../themes/colors';

const clusterEndHeight = 7;

type Props = {|
  ...React.ElementConfig<typeof View>,
  item: ChatMessageInfoItemWithHeight,
  sendFailed: boolean,
  focused: boolean,
  canSwipe?: boolean,
  children: React.Node,
  // Redux state
  composedMessageMaxWidth: number,
  colors: Colors,
|};
class ComposedMessage extends React.PureComponent<Props> {
  static propTypes = {
    item: chatMessageItemPropType.isRequired,
    sendFailed: PropTypes.bool.isRequired,
    focused: PropTypes.bool.isRequired,
    canSwipe: PropTypes.bool,
    children: PropTypes.node.isRequired,
    composedMessageMaxWidth: PropTypes.number.isRequired,
    colors: colorsPropType.isRequired,
  };
  swipeable: ?React.ElementRef<typeof SwipeableMessage>;

  render() {
    assertComposableMessageType(this.props.item.messageInfo.type);
    const {
      item,
      sendFailed,
      focused,
      canSwipe,
      children,
      composedMessageMaxWidth,
      colors,
      ...viewProps
    } = this.props;
    const { id, creator } = item.messageInfo;

    const { isViewer } = creator;
    const alignStyle = isViewer
      ? styles.rightChatBubble
      : styles.leftChatBubble;
    const containerStyle = [
      styles.alignment,
      { marginBottom: 5 + (item.endsCluster ? clusterEndHeight : 0) },
    ];
    const messageBoxStyle = { maxWidth: composedMessageMaxWidth };

    let deliveryIcon = null;
    let failedSendInfo = null;
    if (isViewer) {
      let deliveryIconName;
      let deliveryIconColor = `#${item.threadInfo.color}`;
      if (id !== null && id !== undefined) {
        deliveryIconName = 'check-circle';
      } else if (sendFailed) {
        deliveryIconName = 'x-circle';
        deliveryIconColor = colors.redText;
        failedSendInfo = <FailedSend item={item} />;
      } else {
        deliveryIconName = 'circle';
      }
      deliveryIcon = (
        <View style={styles.iconContainer}>
          <Icon
            name={deliveryIconName}
            style={[styles.icon, { color: deliveryIconColor }]}
          />
        </View>
      );
    }

    let messageBox = (
      <View style={[styles.content, alignStyle]}>
        <View style={[styles.messageBox, messageBoxStyle]}>{children}</View>
        {deliveryIcon}
      </View>
    );
    if (canSwipe) {
      messageBox = (
        <SwipeableMessage
          onSwipeableWillOpen={this.reply}
          isViewer={isViewer}
          swipeableRef={this.swipeableRef}
        >
          {messageBox}
        </SwipeableMessage>
      );
    }

    return (
      <View {...viewProps}>
        <MessageHeader item={item} focused={focused} display="lowContrast" />
        <View style={containerStyle}>
          {messageBox}
          {failedSendInfo}
        </View>
      </View>
    );
  }

  swipeableRef = (swipeable: ?React.ElementRef<typeof SwipeableMessage>) => {
    this.swipeable = swipeable;
  };

  reply = () => {
    invariant(this.swipeable, 'swipeable should be set in reply');
    this.swipeable.close();
  };
}

const styles = StyleSheet.create({
  alignment: {
    marginLeft: 12,
    marginRight: 7,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  icon: {
    fontSize: 16,
    textAlign: 'center',
  },
  iconContainer: {
    marginLeft: 2,
    width: 16,
  },
  leftChatBubble: {
    justifyContent: 'flex-start',
  },
  messageBox: {
    marginRight: 5,
  },
  rightChatBubble: {
    justifyContent: 'flex-end',
  },
});

const ConnectedComposedMessage = connect((state: AppState) => ({
  composedMessageMaxWidth: composedMessageMaxWidthSelector(state),
  colors: colorsSelector(state),
}))(ComposedMessage);

export { ConnectedComposedMessage as ComposedMessage, clusterEndHeight };

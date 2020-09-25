// @flow

import type { ChatMessageInfoItemWithHeight } from './message.react';
import { chatMessageItemPropType } from 'lib/selectors/chat-selectors';
import { assertComposableMessageType } from 'lib/types/message-types';

import * as React from 'react';
import PropTypes from 'prop-types';
import { StyleSheet, View, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import invariant from 'invariant';
import { useSelector } from 'react-redux';

import { createMessageReply } from 'lib/shared/message-utils';

import SwipeableMessage from '../components/swipeable-message.react';
import { FailedSend } from './failed-send.react';
import { composedMessageMaxWidthSelector } from './composed-message-width';
import { MessageHeader } from './message-header.react';
import { type Colors, colorsPropType, useColors } from '../themes/colors';
import {
  inputStatePropType,
  type InputState,
  InputStateContext,
} from '../input/input-state';

const clusterEndHeight = 7;

type BaseProps = {|
  ...React.ElementConfig<typeof View>,
  +item: ChatMessageInfoItemWithHeight,
  +sendFailed: boolean,
  +focused: boolean,
  +canSwipe?: boolean,
  +children: React.Node,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +composedMessageMaxWidth: number,
  +colors: Colors,
  // withInputState
  +inputState: ?InputState,
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
    inputState: inputStatePropType,
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
      inputState,
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
    if (canSwipe && (Platform.OS !== 'android' || Platform.Version >= 21)) {
      messageBox = (
        <View style={[styles.content, alignStyle]}>
          <SwipeableMessage
            onSwipeableWillOpen={this.reply}
            isViewer={isViewer}
            contentStyle={[styles.content, alignStyle]}
            messageBoxStyle={[styles.messageBox, messageBoxStyle]}
          >
            {children}
          </SwipeableMessage>
          {deliveryIcon}
        </View>
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
    const { inputState, item } = this.props;
    invariant(inputState, 'inputState should be set in reply');
    invariant(item.messageInfo.text, 'text should be set in reply');
    inputState.addReply(createMessageReply(item.messageInfo.text));
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

const ConnectedComposedMessage = React.memo<BaseProps>(
  function ConnectedComposedMessage(props: BaseProps) {
    const composedMessageMaxWidth = useSelector(
      composedMessageMaxWidthSelector,
    );
    const colors = useColors();
    const inputState = React.useContext(InputStateContext);
    return (
      <ComposedMessage
        {...props}
        composedMessageMaxWidth={composedMessageMaxWidth}
        colors={colors}
        inputState={inputState}
      />
    );
  },
);

export { ConnectedComposedMessage as ComposedMessage, clusterEndHeight };

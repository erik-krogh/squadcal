// @flow

import type { ChatMessageInfoItemWithHeight } from './message.react';
import { chatMessageItemPropType } from 'lib/selectors/chat-selectors';
import { messageTypes, type RawMessageInfo } from 'lib/types/message-types';
import {
  type InputState,
  inputStatePropType,
  InputStateContext,
} from '../input/input-state';

import * as React from 'react';
import { Text, View } from 'react-native';
import invariant from 'invariant';
import PropTypes from 'prop-types';

import { messageID } from 'lib/shared/message-utils';

import Button from '../components/button.react';
import { useStyles } from '../themes/colors';
import multimediaMessageSendFailed from './multimedia-message-send-failed';
import textMessageSendFailed from './text-message-send-failed';
import { useSelector } from '../redux/redux-utils';

const failedSendHeight = 22;

type BaseProps = {|
  +item: ChatMessageInfoItemWithHeight,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +rawMessageInfo: ?RawMessageInfo,
  +styles: typeof unboundStyles,
  // withInputState
  +inputState: ?InputState,
|};
class FailedSend extends React.PureComponent<Props> {
  static propTypes = {
    item: chatMessageItemPropType.isRequired,
    rawMessageInfo: PropTypes.object,
    styles: PropTypes.objectOf(PropTypes.object).isRequired,
    inputState: inputStatePropType,
  };
  retryingText = false;
  retryingMedia = false;

  componentDidUpdate(prevProps: Props) {
    const newItem = this.props.item;
    const prevItem = prevProps.item;
    if (
      newItem.messageShapeType === 'multimedia' &&
      prevItem.messageShapeType === 'multimedia'
    ) {
      const isFailed = multimediaMessageSendFailed(newItem);
      const wasFailed = multimediaMessageSendFailed(prevItem);
      const isDone =
        newItem.messageInfo.id !== null && newItem.messageInfo.id !== undefined;
      const wasDone =
        prevItem.messageInfo.id !== null &&
        prevItem.messageInfo.id !== undefined;
      if ((isFailed && !wasFailed) || (isDone && !wasDone)) {
        this.retryingMedia = false;
      }
    } else if (
      newItem.messageShapeType === 'text' &&
      prevItem.messageShapeType === 'text'
    ) {
      const isFailed = textMessageSendFailed(newItem);
      const wasFailed = textMessageSendFailed(prevItem);
      const isDone =
        newItem.messageInfo.id !== null && newItem.messageInfo.id !== undefined;
      const wasDone =
        prevItem.messageInfo.id !== null &&
        prevItem.messageInfo.id !== undefined;
      if ((isFailed && !wasFailed) || (isDone && !wasDone)) {
        this.retryingText = false;
      }
    }
  }

  render() {
    if (!this.props.rawMessageInfo) {
      return null;
    }
    return (
      <View style={this.props.styles.failedSendInfo}>
        <Text style={this.props.styles.deliveryFailed} numberOfLines={1}>
          DELIVERY FAILED.
        </Text>
        <Button onPress={this.retrySend}>
          <Text style={this.props.styles.retrySend} numberOfLines={1}>
            {'RETRY?'}
          </Text>
        </Button>
      </View>
    );
  }

  retrySend = () => {
    const { rawMessageInfo } = this.props;
    if (!rawMessageInfo) {
      return;
    }
    const { inputState } = this.props;
    invariant(
      inputState,
      'inputState should be initialized before user can hit retry',
    );
    if (rawMessageInfo.type === messageTypes.TEXT) {
      if (this.retryingText) {
        return;
      }
      this.retryingText = true;
      inputState.sendTextMessage({
        ...rawMessageInfo,
        time: Date.now(),
      });
    } else if (
      rawMessageInfo.type === messageTypes.IMAGES ||
      rawMessageInfo.type === messageTypes.MULTIMEDIA
    ) {
      const { localID } = rawMessageInfo;
      invariant(localID, 'failed RawMessageInfo should have localID');
      if (this.retryingMedia) {
        return;
      }
      this.retryingMedia = true;
      inputState.retryMultimediaMessage(localID);
    }
  };
}

const unboundStyles = {
  deliveryFailed: {
    color: 'listSeparatorLabel',
    paddingHorizontal: 3,
  },
  failedSendInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginRight: 20,
    paddingTop: 5,
  },
  retrySend: {
    color: 'link',
    paddingHorizontal: 3,
  },
};

const ConnectedFailedSend = React.memo<BaseProps>(function ConnectedFailedSend(
  props: BaseProps,
) {
  const id = messageID(props.item.messageInfo);
  const rawMessageInfo = useSelector(
    (state) => state.messageStore.messages[id],
  );
  const styles = useStyles(unboundStyles);
  const inputState = React.useContext(InputStateContext);
  return (
    <FailedSend
      {...props}
      rawMessageInfo={rawMessageInfo}
      styles={styles}
      inputState={inputState}
    />
  );
});

export { ConnectedFailedSend as FailedSend, failedSendHeight };

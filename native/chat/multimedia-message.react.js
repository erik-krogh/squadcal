// @flow

import { chatMessageItemPropType } from 'lib/selectors/chat-selectors';
import type {
  MultimediaMessageInfo,
  LocalMessageInfo,
} from 'lib/types/message-types';
import type { Media, Corners } from 'lib/types/media-types';
import type { ViewStyle } from '../types/styles';
import type { ThreadInfo } from 'lib/types/thread-types';
import {
  type VerticalBounds,
  verticalBoundsPropType,
} from '../types/layout-types';
import type { MessagePendingUploads } from '../input/input-state';
import {
  messageListRoutePropType,
  messageListNavPropType,
} from './message-list-types';
import type { ChatNavigationProp } from './chat.react';
import type { NavigationRoute } from '../navigation/route-names';

import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import PropTypes from 'prop-types';
import invariant from 'invariant';

import { ComposedMessage, clusterEndHeight } from './composed-message.react';
import MultimediaMessageMultimedia from './multimedia-message-multimedia.react';
import {
  allCorners,
  filterCorners,
  getRoundedContainerStyle,
} from './rounded-corners';
import { authorNameHeight } from './message-header.react';
import { failedSendHeight } from './failed-send.react';
import sendFailed from './multimedia-message-send-failed';

type ContentSizes = {|
  imageHeight: number,
  contentHeight: number,
  contentWidth: number,
|};
export type ChatMultimediaMessageInfoItem = {|
  ...ContentSizes,
  itemType: 'message',
  messageShapeType: 'multimedia',
  messageInfo: MultimediaMessageInfo,
  localMessageInfo: ?LocalMessageInfo,
  threadInfo: ThreadInfo,
  startsConversation: boolean,
  startsCluster: boolean,
  endsCluster: boolean,
  pendingUploads: ?MessagePendingUploads,
|};

function getMediaPerRow(mediaCount: number) {
  if (mediaCount === 0) {
    return 0; // ???
  } else if (mediaCount === 1) {
    return 1;
  } else if (mediaCount === 2) {
    return 2;
  } else if (mediaCount === 3) {
    return 3;
  } else if (mediaCount === 4) {
    return 2;
  } else {
    return 3;
  }
}

// Called by MessageListContainer
// The results are merged into ChatMultimediaMessageInfoItem
function multimediaMessageContentSizes(
  messageInfo: MultimediaMessageInfo,
  composedMessageMaxWidth: number,
): ContentSizes {
  invariant(messageInfo.media.length > 0, 'should have media');

  if (messageInfo.media.length === 1) {
    const [media] = messageInfo.media;
    const { height, width } = media.dimensions;

    let imageHeight = height;
    if (width > composedMessageMaxWidth) {
      imageHeight = (height * composedMessageMaxWidth) / width;
    }
    if (imageHeight < 50) {
      imageHeight = 50;
    }

    let contentWidth = height ? (width * imageHeight) / height : 0;
    if (contentWidth > composedMessageMaxWidth) {
      contentWidth = composedMessageMaxWidth;
    }

    return { imageHeight, contentHeight: imageHeight, contentWidth };
  }

  const contentWidth = composedMessageMaxWidth;

  const mediaPerRow = getMediaPerRow(messageInfo.media.length);
  const marginSpace = spaceBetweenImages * (mediaPerRow - 1);
  const imageHeight = (contentWidth - marginSpace) / mediaPerRow;

  const numRows = Math.ceil(messageInfo.media.length / mediaPerRow);
  const contentHeight =
    numRows * imageHeight + (numRows - 1) * spaceBetweenImages;

  return { imageHeight, contentHeight, contentWidth };
}

// Called by Message
// Given a ChatMultimediaMessageInfoItem, determines exact height of row
function multimediaMessageItemHeight(item: ChatMultimediaMessageInfoItem) {
  const { messageInfo, contentHeight, startsCluster, endsCluster } = item;
  const { creator } = messageInfo;
  const { isViewer } = creator;
  let height = 5 + contentHeight; // 5 from marginBottom in ComposedMessage
  if (!isViewer && startsCluster) {
    height += authorNameHeight;
  }
  if (endsCluster) {
    height += clusterEndHeight;
  }
  if (sendFailed(item)) {
    height += failedSendHeight;
  }
  return height;
}

const borderRadius = 16;

type Props = {|
  ...React.ElementConfig<typeof View>,
  item: ChatMultimediaMessageInfoItem,
  navigation: ChatNavigationProp<'MessageList'>,
  route: NavigationRoute<'MessageList'>,
  focused: boolean,
  toggleFocus: (messageKey: string) => void,
  verticalBounds: ?VerticalBounds,
|};
class MultimediaMessage extends React.PureComponent<Props> {
  static propTypes = {
    item: chatMessageItemPropType.isRequired,
    navigation: messageListNavPropType.isRequired,
    route: messageListRoutePropType.isRequired,
    focused: PropTypes.bool.isRequired,
    toggleFocus: PropTypes.func.isRequired,
    verticalBounds: verticalBoundsPropType,
  };

  render() {
    const {
      item,
      navigation,
      route,
      focused,
      toggleFocus,
      verticalBounds,
      ...viewProps
    } = this.props;
    const containerStyle = {
      height: item.contentHeight,
      width: item.contentWidth,
    };
    return (
      <ComposedMessage
        item={item}
        sendFailed={sendFailed(item)}
        focused={focused}
        {...viewProps}
      >
        <View style={containerStyle}>{this.renderContent()}</View>
      </ComposedMessage>
    );
  }

  renderContent(): React.Node {
    const { messageInfo, imageHeight } = this.props.item;
    invariant(messageInfo.media.length > 0, 'should have media');
    if (messageInfo.media.length === 1) {
      return this.renderImage(messageInfo.media[0], 0, 0, allCorners);
    }

    const mediaPerRow = getMediaPerRow(messageInfo.media.length);
    const rowHeight = imageHeight + spaceBetweenImages;

    const rows = [];
    for (
      let i = 0, verticalOffset = 0;
      i < messageInfo.media.length;
      i += mediaPerRow, verticalOffset += rowHeight
    ) {
      const rowMedia = [];
      for (let j = i; j < i + mediaPerRow; j++) {
        rowMedia.push(messageInfo.media[j]);
      }

      const firstRow = i === 0;
      const lastRow = i + mediaPerRow >= messageInfo.media.length;

      const row = [];
      let j = 0;
      for (; j < rowMedia.length; j++) {
        const media = rowMedia[j];
        const firstInRow = j === 0;
        const lastInRow = j + 1 === rowMedia.length;
        const inLastColumn = j + 1 === mediaPerRow;
        const corners = {
          topLeft: firstRow && firstInRow,
          topRight: firstRow && inLastColumn,
          bottomLeft: lastRow && firstInRow,
          bottomRight: lastRow && inLastColumn,
        };
        const style = lastInRow ? null : styles.imageBeforeImage;
        row.push(
          this.renderImage(media, i + j, verticalOffset, corners, style),
        );
      }
      for (; j < mediaPerRow; j++) {
        const key = `filler${j}`;
        const style =
          j + 1 < mediaPerRow
            ? [styles.filler, styles.imageBeforeImage]
            : styles.filler;
        row.push(<View style={style} key={key} />);
      }

      const rowStyle = lastRow ? styles.row : [styles.row, styles.rowAboveRow];
      rows.push(
        <View style={rowStyle} key={i}>
          {row}
        </View>,
      );
    }
    return <View style={styles.grid}>{rows}</View>;
  }

  renderImage(
    media: Media,
    index: number,
    verticalOffset: number,
    corners: Corners,
    style?: ViewStyle,
  ): React.Node {
    const filteredCorners = filterCorners(corners, this.props.item);
    const roundedStyle = getRoundedContainerStyle(
      filteredCorners,
      borderRadius,
    );
    const { pendingUploads } = this.props.item;
    const mediaInfo = {
      ...media,
      corners: filteredCorners,
      index,
    };
    const pendingUpload = pendingUploads && pendingUploads[media.id];
    return (
      <MultimediaMessageMultimedia
        mediaInfo={mediaInfo}
        navigation={this.props.navigation}
        route={this.props.route}
        verticalBounds={this.props.verticalBounds}
        verticalOffset={verticalOffset}
        style={[style, roundedStyle]}
        postInProgress={!!pendingUploads}
        pendingUpload={pendingUpload}
        messageFocused={this.props.focused}
        toggleMessageFocus={this.props.toggleFocus}
        item={this.props.item}
        key={index}
      />
    );
  }
}

const spaceBetweenImages = 4;
const styles = StyleSheet.create({
  filler: {
    flex: 1,
  },
  grid: {
    flex: 1,
    justifyContent: 'space-between',
  },
  imageBeforeImage: {
    marginRight: spaceBetweenImages,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowAboveRow: {
    marginBottom: spaceBetweenImages,
  },
});

export {
  borderRadius as multimediaMessageBorderRadius,
  MultimediaMessage,
  multimediaMessageContentSizes,
  multimediaMessageItemHeight,
  sendFailed as multimediaMessageSendFailed,
};

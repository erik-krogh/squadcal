// @flow

import type { UserInfo } from 'lib/types/user-types';
import type { AppState } from '../redux/redux-setup';

import * as React from 'react';
import { View, Text } from 'react-native';

import { connect } from 'lib/utils/redux-utils';

import Button from '../components/button.react';
import { type Colors, colorsSelector, styleSelector } from '../themes/colors';
import { SingleLine } from '../components/single-line.react';

type Props = {
  userInfo: UserInfo,
  onPressItem: (userInfo: UserInfo) => void,
  // Redux state
  colors: Colors,
  styles: typeof styles,
};
class FakeChatThreadListItem extends React.PureComponent<Props> {
  render() {
    const { listIosHighlightUnderlay } = this.props.colors;

    return (
      <Button
        onPress={this.onPress}
        iosFormat="highlight"
        iosHighlightUnderlayColor={listIosHighlightUnderlay}
        iosActiveOpacity={0.85}
      >
        <View style={this.props.styles.container}>
          <View style={this.props.styles.row}>
            <SingleLine style={this.props.styles.threadName}>
              {this.props.userInfo.username}
            </SingleLine>
          </View>
          <View style={this.props.styles.row}>
            <Text style={this.props.styles.noMessages} numberOfLines={1}>
              Create a thread with {this.props.userInfo.username}
            </Text>
          </View>
        </View>
      </Button>
    );
  }

  onPress = () => {
    this.props.onPressItem(this.props.userInfo);
  };
}

const styles = {
  container: {
    height: 60,
    paddingLeft: 10,
    paddingRight: 10,
    paddingTop: 5,
  },
  noMessages: {
    color: 'listForegroundTertiaryLabel',
    flex: 1,
    fontSize: 16,
    fontStyle: 'italic',
    paddingLeft: 10,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  threadName: {
    color: 'listForegroundSecondaryLabel',
    flex: 1,
    fontSize: 20,
    paddingLeft: 10,
  },
};
const stylesSelector = styleSelector(styles);

export default connect((state: AppState) => ({
  colors: colorsSelector(state),
  styles: stylesSelector(state),
}))(FakeChatThreadListItem);

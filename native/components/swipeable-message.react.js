// @flow

import type { AppState } from '../redux/redux-setup';

import * as React from 'react';
import { View, Animated } from 'react-native';
import PropTypes from 'prop-types';
import SwipeableComponent from 'react-native-gesture-handler/Swipeable';
import FontAwesomeIcon from 'react-native-vector-icons/FontAwesome';

import { connect } from 'lib/utils/redux-utils';

import {
  type Colors,
  colorsPropType,
  colorsSelector,
  styleSelector,
} from '../themes/colors';

type Props = {
  +onSwipeableWillOpen?: () => void,
  +swipeableRef?: (
    current: ?React.ElementRef<typeof SwipeableComponent>,
  ) => void,
  +isViewer: boolean,
  +children?: React.Node,
  // Redux state
  +colors: Colors,
  +styles: typeof styles,
  ...
};

class SwipeableMessage extends React.PureComponent<Props> {
  static propTypes = {
    onSwipeableWillOpen: PropTypes.func,
    swipeableRef: PropTypes.func,
    isViewer: PropTypes.bool.isRequired,
    children: PropTypes.node,
    colors: colorsPropType.isRequired,
    styles: PropTypes.objectOf(PropTypes.object).isRequired,
  };

  renderLeftActions = progress => {
    if (this.props.isViewer) {
      return null;
    }

    const outputRange = [-40, 0];
    return this.getActionWithOutput(progress, outputRange);
  };

  renderRightActions = progress => {
    if (!this.props.isViewer) {
      return null;
    }

    const outputRange = [40, 0];
    return this.getActionWithOutput(progress, outputRange);
  };

  getActionWithOutput = (progress, outputRange) => {
    const trans = progress.interpolate({
      inputRange: [0, 1],
      outputRange: outputRange,
      extrapolate: 'clamp',
    });

    return (
      <View style={this.props.styles.icon}>
        <Animated.View
          style={{
            transform: [{ translateX: trans }],
          }}
        >
          <View style={this.props.styles.iconBackground}>
            <FontAwesomeIcon
              name="reply"
              color={this.props.colors.blockQuoteBorder}
              size={16}
            />
          </View>
        </Animated.View>
      </View>
    );
  };

  render() {
    return (
      <SwipeableComponent
        renderLeftActions={this.renderLeftActions}
        renderRightActions={this.renderRightActions}
        onSwipeableWillOpen={this.props.onSwipeableWillOpen}
        ref={this.props.swipeableRef}
        friction={2}
      >
        {this.props.children}
      </SwipeableComponent>
    );
  }
}

const styles = {
  icon: {
    justifyContent: 'center',
  },
  iconBackground: {
    alignItems: 'center',
    backgroundColor: 'listChatBubble',
    borderRadius: 30,
    height: 30,
    justifyContent: 'center',
    marginLeft: 10,
    marginRight: 10,
    width: 30,
  },
};
const stylesSelector = styleSelector(styles);

export default connect((state: AppState) => ({
  colors: colorsSelector(state),
  styles: stylesSelector(state),
}))(SwipeableMessage);

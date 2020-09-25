// @flow

import * as React from 'react';
import { View, Animated } from 'react-native';
import PropTypes from 'prop-types';
import FontAwesomeIcon from 'react-native-vector-icons/FontAwesome';
import Interactable from 'react-native-interactable';
import { TapticFeedback } from 'react-native-in-app-message';

import {
  type Colors,
  colorsPropType,
  useColors,
  useStyles,
} from '../themes/colors';

type BaseProps = {|
  +onSwipeableWillOpen: () => void,
  +isViewer: boolean,
  +children?: React.Node,
  +contentStyle: any,
  +messageBoxStyle: any,
|};
type Props = {
  ...BaseProps,
  // Redux state
  +colors: Colors,
  +styles: typeof unboundStyles,
  ...
};

type State = {|
  animatedValueX: Animated.Value,
|};
class SwipeableMessage extends React.PureComponent<Props, State> {
  static propTypes = {
    onSwipeableWillOpen: PropTypes.func,
    swipeableRef: PropTypes.func,
    isViewer: PropTypes.bool.isRequired,
    children: PropTypes.node,
    colors: colorsPropType.isRequired,
    styles: PropTypes.objectOf(PropTypes.object).isRequired,
  };

  constructor(props) {
    super(props);
    this.animatedValueX = new Animated.Value(0);
  }
  animatedValueX: Animated.Value;

  render() {
    const { isViewer } = this.props;
    let iconPosition = {};
    let boundaries = {};
    let snapPoints = {};
    let influenceArea = {};
    let inputRange = [];
    let outputRange = [];

    if (!isViewer) {
      iconPosition.left = 0;
      inputRange = [0, 50];
      outputRange = [-70, 0];
      boundaries = { left: 0 };
      snapPoints = { x: -60, id: 'right' };
      influenceArea = { left: 60 };
    } else {
      iconPosition.right = 0;
      inputRange = [-50, 0];
      outputRange = [0, 70];
      boundaries = { right: 0 };
      snapPoints = { x: 60, id: 'left' };
      influenceArea = { right: -60 };
    }

    return (
      <View style={this.props.contentStyle}>
        <View style={[this.props.styles.icon, iconPosition]}>
          <Animated.View
            style={{
              transform: [
                {
                  translateX: this.animatedValueX.interpolate({
                    inputRange: inputRange,
                    outputRange: outputRange,
                    extrapolate: 'clamp',
                  }),
                },
              ],
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
        <Interactable.View
          horizontalOnly
          boundaries={boundaries}
          snapPoints={[snapPoints, { x: 0, id: 'initialPosition' }]}
          dragWithSpring={{ tension: 2000, damping: 0.5 }}
          frictionAreas={[{ damping: 0.5 }]}
          onDrag={this.onDrag}
          animatedValueX={this.animatedValueX}
          alertAreas={[{ id: 'replyArea', influenceArea: influenceArea }]}
          onAlert={this.onAlert}
        >
          <View style={this.props.messageBoxStyle}>{this.props.children}</View>
        </Interactable.View>
      </View>
    );
  }
  onAlert = event => {
    console.log(this.animatedValueX);
    console.log('alert ', event.nativeEvent);
    if (JSON.stringify(event.nativeEvent).includes('"replyArea":"enter"')) {
      console.log('entering area');
      TapticFeedback.impact();
    }
  };

  onDrag = event => {
    const drag = event.nativeEvent;
    console.log('drag ', event.nativeEvent);
    if (
      drag.targetSnapPointId === 'initialPosition' &&
      (drag.x > 60 || drag.x < -60)
    ) {
      this.props.onSwipeableWillOpen();
    }
  };
}

const unboundStyles = {
  icon: {
    justifyContent: 'center',
    position: 'absolute',
  },
  iconBackground: {
    alignItems: 'center',
    backgroundColor: 'listChatBubble',
    borderRadius: 30,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
};

export default React.memo<BaseProps>(function ConnectedSwipeableMessage(
  props: BaseProps,
) {
  const colors = useColors();
  const styles = useStyles(unboundStyles);
  return <SwipeableMessage {...props} colors={colors} styles={styles} />;
});

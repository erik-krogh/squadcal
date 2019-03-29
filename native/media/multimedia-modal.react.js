// @flow

import type {
  NavigationScreenProp,
  NavigationLeafRoute,
  NavigationScene,
  NavigationTransitionProps,
} from 'react-navigation';
import {
  type Media,
  mediaPropType,
  type Dimensions,
  dimensionsPropType,
} from 'lib/types/media-types';
import type { AppState } from '../redux-setup';
import { type VerticalBounds, verticalBoundsPropType } from './vertical-bounds';

import * as React from 'react';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
  TouchableOpacity,
} from 'react-native';
import PropTypes from 'prop-types';
import Icon from 'react-native-vector-icons/Feather';
import {
  PinchGestureHandler,
  PanGestureHandler,
  State as GestureState,
} from 'react-native-gesture-handler';
import Orientation from 'react-native-orientation-locker';

import { connect } from 'lib/utils/redux-utils';

import {
  contentBottomOffset,
  dimensionsSelector,
  contentVerticalOffsetSelector,
} from '../selectors/dimension-selectors';
import Multimedia from './multimedia.react';
import ConnectedStatusBar from '../connected-status-bar.react';

type LayoutCoordinates = $ReadOnly<{|
  x: number,
  y: number,
  width: number,
  height: number,
|}>;
type NavProp = NavigationScreenProp<{|
  ...NavigationLeafRoute,
  params: {|
    media: Media,
    initialCoordinates: LayoutCoordinates,
    verticalBounds: VerticalBounds,
  |},
|}>;

type Props = {|
  navigation: NavProp,
  scene: NavigationScene,
  transitionProps: NavigationTransitionProps,
  // Redux state
  screenDimensions: Dimensions,
  contentVerticalOffset: number,
|};
class MultimediaModal extends React.PureComponent<Props> {

  static propTypes = {
    navigation: PropTypes.shape({
      state: PropTypes.shape({
        params: PropTypes.shape({
          media: mediaPropType.isRequired,
          initialCoordinates: PropTypes.shape({
            x: PropTypes.number.isRequired,
            y: PropTypes.number.isRequired,
            width: PropTypes.number.isRequired,
            height: PropTypes.number.isRequired,
          }).isRequired,
          verticalBounds: verticalBoundsPropType.isRequired,
        }).isRequired,
      }).isRequired,
      goBack: PropTypes.func.isRequired,
    }).isRequired,
    transitionProps: PropTypes.object.isRequired,
    scene: PropTypes.object.isRequired,
    screenDimensions: dimensionsPropType.isRequired,
    contentVerticalOffset: PropTypes.number.isRequired,
  };

  centerXNum: number;
  centerYNum: number;
  centerX = new Animated.Value(0);
  centerY = new Animated.Value(0);

  pinchScale = new Animated.Value(1);
  pinchFocalX = new Animated.Value(0);
  pinchFocalY = new Animated.Value(0);
  pinchEvent = Animated.event(
    [{
      nativeEvent: {
        scale: this.pinchScale,
        focalX: this.pinchFocalX,
        focalY: this.pinchFocalY,
      },
    }],
    { useNativeDriver: true },
  );

  panX = new Animated.Value(0);
  panY = new Animated.Value(0);
  panEvent = Animated.event(
    [{
      nativeEvent: {
        translationX: this.panX,
        translationY: this.panY,
      },
    }],
    { useNativeDriver: true },
  );

  curScaleNum = 1;
  curXNum = 0;
  curYNum = 0;
  curScale = new Animated.Value(1);
  curX = new Animated.Value(0);
  curY = new Animated.Value(0);

  progress: Animated.Value;
  scale: Animated.Value;
  pinchX: Animated.Value;
  pinchY: Animated.Value;
  x: Animated.Value;
  y: Animated.Value;
  imageContainerOpacity: Animated.Value;

  constructor(props: Props) {
    super(props);
    this.updateCenter();

    const { height, width } = this.imageDimensions;
    const { height: screenHeight, width: screenWidth } = this.screenDimensions;
    const top = (screenHeight - height) / 2 + props.contentVerticalOffset;
    const left = (screenWidth - width) / 2;

    const { initialCoordinates } = props.navigation.state.params;
    const initialScale = new Animated.Value(initialCoordinates.width / width);
    const initialTranslateX = new Animated.Value(
      (initialCoordinates.x + initialCoordinates.width / 2)
        - (left + width / 2),
    );
    const initialTranslateY = new Animated.Value(
      (initialCoordinates.y + initialCoordinates.height / 2)
        - (top + height / 2),
    );

    const { position } = props.transitionProps;
    const { index } = props.scene;
    this.progress = position.interpolate({
      inputRange: [ index - 1, index ],
      outputRange: ([ 0, 1 ]: number[]),
      extrapolate: 'clamp',
    });
    this.imageContainerOpacity = this.progress.interpolate({
      inputRange: [ 0, 0.1 ],
      outputRange: ([ 0, 1 ]: number[]),
      extrapolate: 'clamp',
    });

    const reverseProgress = Animated.subtract(1, this.progress);
    this.scale = Animated.add(
      Animated.multiply(reverseProgress, initialScale),
      Animated.multiply(
        this.progress,
        Animated.multiply(this.curScale, this.pinchScale),
      ),
    );

    this.pinchX = Animated.multiply(
      Animated.subtract(1, this.pinchScale),
      Animated.subtract(
        Animated.subtract(
          this.pinchFocalX,
          this.curX,
        ),
        this.centerX,
      ),
    );
    this.x = Animated.add(
      Animated.multiply(reverseProgress, initialTranslateX),
      Animated.multiply(
        this.progress,
        Animated.add(
          this.curX,
          Animated.add(this.pinchX, this.panX),
        ),
      ),
    );

    this.pinchY = Animated.multiply(
      Animated.subtract(1, this.pinchScale),
      Animated.subtract(
        Animated.subtract(
          this.pinchFocalY,
          this.curY,
        ),
        this.centerY,
      ),
    );
    this.y = Animated.add(
      Animated.multiply(reverseProgress, initialTranslateY),
      Animated.multiply(
        this.progress,
        Animated.add(
          this.curY,
          Animated.add(this.pinchY, this.panY),
        ),
      ),
    );
  }

  updateCenter() {
    const { height: screenHeight, width: screenWidth } = this.screenDimensions;
    this.centerXNum = screenWidth / 2;
    this.centerYNum = screenHeight / 2 + this.props.contentVerticalOffset;
    this.centerX.setValue(this.centerXNum);
    this.centerY.setValue(this.centerYNum);
  }

  componentDidMount() {
    if (MultimediaModal.isActive(this.props)) {
      Orientation.unlockAllOrientations();
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (
      this.props.screenDimensions !== prevProps.screenDimensions ||
      this.props.contentVerticalOffset !== prevProps.contentVerticalOffset
    ) {
      this.updateCenter();
    }

    const isActive = MultimediaModal.isActive(this.props);
    const wasActive = MultimediaModal.isActive(prevProps);
    if (isActive && !wasActive) {
      Orientation.unlockAllOrientations();
    } else if (!isActive && wasActive) {
      Orientation.lockToPortrait();
    }
  }

  get screenDimensions(): Dimensions {
    const { screenDimensions, contentVerticalOffset } = this.props;
    if (contentVerticalOffset === 0) {
      return screenDimensions;
    }
    const { height, width } = screenDimensions;
    return { height: height - contentVerticalOffset, width };
  }

  get imageDimensions(): Dimensions {
    // Make space for the close button
    let { height: maxHeight, width: maxWidth } = this.screenDimensions;
    if (maxHeight > maxWidth) {
      maxHeight -= 100;
    } else {
      maxWidth -= 100;
    }

    const { dimensions } = this.props.navigation.state.params.media;
    if (dimensions.height < maxHeight && dimensions.width < maxWidth) {
      return dimensions;
    }

    const heightRatio = maxHeight / dimensions.height;
    const widthRatio = maxWidth / dimensions.width;
    if (heightRatio < widthRatio) {
      return {
        height: maxHeight,
        width: dimensions.width * heightRatio,
      };
    } else {
      return {
        width: maxWidth,
        height: dimensions.height * widthRatio,
      };
    }
  }

  get imageContainerStyle() {
    const { height, width } = this.imageDimensions;
    const { height: screenHeight, width: screenWidth } = this.screenDimensions;
    const top = (screenHeight - height) / 2 + this.props.contentVerticalOffset;
    const left = (screenWidth - width) / 2;
    const { verticalBounds } = this.props.navigation.state.params;
    return {
      height,
      width,
      marginTop: top - verticalBounds.y,
      marginLeft: left,
      opacity: this.imageContainerOpacity,
      transform: [
        { translateX: this.x },
        { translateY: this.y },
        { scale: this.scale },
      ],
    };
  }

  static isActive(props) {
    const { index } = props.scene;
    return index === props.transitionProps.index;
  }

  get contentContainerStyle() {
    const { verticalBounds } = this.props.navigation.state.params;
    const fullScreenHeight = this.screenDimensions.height
      + contentBottomOffset
      + this.props.contentVerticalOffset;
    const top = verticalBounds.y;
    const bottom = fullScreenHeight - verticalBounds.y - verticalBounds.height;

    // margin will clip, but padding won't
    const verticalStyle = MultimediaModal.isActive(this.props)
      ? { paddingTop: top, paddingBottom: bottom }
      : { marginTop: top, marginBottom: bottom };
    return [ styles.contentContainer, verticalStyle ];
  }

  render() {
    const { media } = this.props.navigation.state.params;
    const statusBar = MultimediaModal.isActive(this.props)
      ? <ConnectedStatusBar barStyle="light-content" />
      : null;
    const backdropStyle = { opacity: this.progress };
    const closeButtonStyle = {
      opacity: this.progress,
      top: Math.max(this.props.contentVerticalOffset, 6),
    };
    const view = (
      <Animated.View style={styles.container}>
        {statusBar}
        <Animated.View style={[ styles.backdrop, backdropStyle ]} />
        <View style={this.contentContainerStyle}>
          <TouchableWithoutFeedback onPress={this.close}>
            <View style={styles.cover} />
          </TouchableWithoutFeedback>
          <Animated.View style={this.imageContainerStyle}>
            <Multimedia media={media} spinnerColor="white" />
          </Animated.View>
        </View>
        <Animated.View style={[
          styles.closeButtonContainer,
          closeButtonStyle,
        ]}>
          <TouchableOpacity onPress={this.close}>
            <Icon name="x-circle" style={styles.closeButton} />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    );
    return (
      <PinchGestureHandler
        onGestureEvent={this.pinchEvent}
        onHandlerStateChange={this.onPinchHandlerStateChange}
      >
        <Animated.View style={styles.container}>
          <PanGestureHandler
            onGestureEvent={this.panEvent}
            onHandlerStateChange={this.onPanHandlerStateChange}
          >
            {view}
          </PanGestureHandler>
        </Animated.View>
      </PinchGestureHandler>
    );
  }

  close = () => {
    this.props.navigation.goBack();
  }

  onPinchHandlerStateChange = (
    event: { nativeEvent: {
      state: number,
      oldState: number,
      scale: number,
      focalX: number,
      focalY: number,
    } },
  ) => {
    const { state, oldState, scale, focalX, focalY } = event.nativeEvent;
    if (state === GestureState.ACTIVE || oldState !== GestureState.ACTIVE) {
      return;
    }

    this.curScaleNum *= scale;
    this.curScale.setValue(this.curScaleNum);
    this.pinchScale.setValue(1);

    // Keep this logic in sync with pinchX/pinchY definitions in constructor
    this.curXNum += (1 - scale) * (focalX - this.curXNum - this.centerXNum);
    this.curYNum += (1 - scale) * (focalY - this.curYNum - this.centerYNum);
    this.curX.setValue(this.curXNum);
    this.curY.setValue(this.curYNum);
  }

  onPanHandlerStateChange = (
    event: { nativeEvent: {
      state: number,
      oldState: number,
      translationX: number,
      translationY: number,
    } },
  ) => {
    const { state, oldState, translationX, translationY } = event.nativeEvent;
    if (state === GestureState.ACTIVE || oldState !== GestureState.ACTIVE) {
      return;
    }
    this.curXNum += translationX;
    this.curYNum += translationY;
    this.curX.setValue(this.curXNum);
    this.curY.setValue(this.curYNum);
    this.panX.setValue(0);
    this.panY.setValue(0);
  }

}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "black",
  },
  contentContainer: {
    flex: 1,
    overflow: "hidden",
  },
  cover: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  closeButtonContainer: {
    position: "absolute",
    right: 12,
  },
  closeButton: {
    fontSize: 36,
    color: "white",
  },
});

export default connect(
  (state: AppState) => ({
    screenDimensions: dimensionsSelector(state),
    contentVerticalOffset: contentVerticalOffsetSelector(state),
  }),
)(MultimediaModal);

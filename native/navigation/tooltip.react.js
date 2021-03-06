// @flow

import {
  type VerticalBounds,
  verticalBoundsPropType,
  type LayoutCoordinates,
  layoutCoordinatesPropType,
} from '../types/layout-types';
import {
  type DimensionsInfo,
  dimensionsInfoPropType,
} from '../redux/dimensions-updater.react';
import type { ViewStyle, TextStyle } from '../types/styles';
import type { Dispatch } from 'lib/types/redux-types';
import type { LayoutEvent } from '../types/react-native';
import type { AppNavigationProp } from './app-navigator.react';
import type { TooltipModalParamList } from './route-names';
import type { LeafRoute } from '@react-navigation/native';
import {
  type InputState,
  inputStatePropType,
  InputStateContext,
} from '../input/input-state';

import * as React from 'react';
import Animated from 'react-native-reanimated';
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Platform,
  TouchableOpacity,
  Text,
  ViewPropTypes,
} from 'react-native';
import PropTypes from 'prop-types';
import invariant from 'invariant';
import { useDispatch } from 'react-redux';
import { TapticFeedback } from 'react-native-in-app-message';

import {
  type ServerCallState,
  serverCallStatePropType,
  serverCallStateSelector,
} from 'lib/selectors/server-calls';
import {
  createBoundServerCallsSelector,
  useDispatchActionPromise,
  type DispatchActionPromise,
  type ActionFunc,
  type DispatchFunctions,
  type BoundServerCall,
} from 'lib/utils/action-utils';

import {
  OverlayContext,
  type OverlayContextType,
  overlayContextPropType,
} from './overlay-context';
import { SingleLine } from '../components/single-line.react';
import { useSelector } from '../redux/redux-utils';

/* eslint-disable import/no-named-as-default-member */
const { Value, Extrapolate, add, multiply, interpolate } = Animated;
/* eslint-enable import/no-named-as-default-member */

export type TooltipEntry<RouteName: $Keys<TooltipModalParamList>> = {|
  +id: string,
  +text: string,
  +onPress: (
    route: TooltipRoute<RouteName>,
    dispatchFunctions: DispatchFunctions,
    bindServerCall: (serverCall: ActionFunc) => BoundServerCall,
    inputState: ?InputState,
  ) => mixed,
|};
type TooltipItemProps<RouteName> = {|
  +spec: TooltipEntry<RouteName>,
  +onPress: (entry: TooltipEntry<RouteName>) => void,
  +containerStyle?: ViewStyle,
  +labelStyle?: TextStyle,
|};
type TooltipSpec<RouteName> = {|
  +entries: $ReadOnlyArray<TooltipEntry<RouteName>>,
  +labelStyle?: ViewStyle,
|};

export type TooltipParams<CustomProps> = {|
  ...CustomProps,
  +presentedFrom: string,
  +initialCoordinates: LayoutCoordinates,
  +verticalBounds: VerticalBounds,
  +location?: 'above' | 'below',
  +margin?: number,
  +visibleEntryIDs?: $ReadOnlyArray<string>,
|};
export type TooltipRoute<RouteName: $Keys<TooltipModalParamList>> = {|
  ...LeafRoute<RouteName>,
  +params: $ElementType<TooltipModalParamList, RouteName>,
|};

type BaseTooltipProps<RouteName> = {|
  +navigation: AppNavigationProp<RouteName>,
  +route: TooltipRoute<RouteName>,
|};
type ButtonProps<RouteName> = {|
  ...BaseTooltipProps<RouteName>,
  +progress: Value,
|};
type TooltipProps<RouteName> = {|
  ...BaseTooltipProps<RouteName>,
  // Redux state
  +dimensions: DimensionsInfo,
  +serverCallState: ServerCallState,
  // Redux dispatch functions
  +dispatch: Dispatch,
  +dispatchActionPromise: DispatchActionPromise,
  // withOverlayContext
  +overlayContext: ?OverlayContextType,
  // withInputState
  +inputState: ?InputState,
|};
function createTooltip<RouteName: $Keys<TooltipModalParamList>>(
  ButtonComponent: React.ComponentType<ButtonProps<RouteName>>,
  tooltipSpec: TooltipSpec<RouteName>,
): React.ComponentType<BaseTooltipProps<RouteName>> {
  class TooltipItem extends React.PureComponent<TooltipItemProps<RouteName>> {
    static propTypes = {
      spec: PropTypes.shape({
        text: PropTypes.string.isRequired,
        onPress: PropTypes.func.isRequired,
      }).isRequired,
      onPress: PropTypes.func.isRequired,
      containerStyle: ViewPropTypes.style,
      labelStyle: Text.propTypes.style,
    };

    render() {
      return (
        <TouchableOpacity
          onPress={this.onPress}
          style={[styles.itemContainer, this.props.containerStyle]}
        >
          <SingleLine style={[styles.label, this.props.labelStyle]}>
            {this.props.spec.text}
          </SingleLine>
        </TouchableOpacity>
      );
    }

    onPress = () => {
      this.props.onPress(this.props.spec);
    };
  }
  class Tooltip extends React.PureComponent<TooltipProps<RouteName>> {
    static propTypes = {
      navigation: PropTypes.shape({
        goBackOnce: PropTypes.func.isRequired,
      }).isRequired,
      route: PropTypes.shape({
        params: PropTypes.shape({
          initialCoordinates: layoutCoordinatesPropType.isRequired,
          verticalBounds: verticalBoundsPropType.isRequired,
          location: PropTypes.oneOf(['above', 'below']),
          margin: PropTypes.number,
          visibleEntryIDs: PropTypes.arrayOf(PropTypes.string),
        }).isRequired,
      }).isRequired,
      dimensions: dimensionsInfoPropType.isRequired,
      serverCallState: serverCallStatePropType.isRequired,
      dispatch: PropTypes.func.isRequired,
      dispatchActionPromise: PropTypes.func.isRequired,
      overlayContext: overlayContextPropType,
      inputState: inputStatePropType,
    };
    backdropOpacity: Value;
    tooltipContainerOpacity: Value;
    tooltipVerticalAbove: Value;
    tooltipVerticalBelow: Value;
    tooltipHorizontalOffset = new Value(0);
    tooltipHorizontal: Value;

    constructor(props: TooltipProps<RouteName>) {
      super(props);

      const { overlayContext } = props;
      invariant(overlayContext, 'Tooltip should have OverlayContext');
      const { position } = overlayContext;

      this.backdropOpacity = interpolate(position, {
        inputRange: [0, 1],
        outputRange: [0, 0.7],
        extrapolate: Extrapolate.CLAMP,
      });
      this.tooltipContainerOpacity = interpolate(position, {
        inputRange: [0, 0.1],
        outputRange: [0, 1],
        extrapolate: Extrapolate.CLAMP,
      });

      const { margin } = this;
      this.tooltipVerticalAbove = interpolate(position, {
        inputRange: [0, 1],
        outputRange: [margin + this.tooltipHeight / 2, 0],
        extrapolate: Extrapolate.CLAMP,
      });
      this.tooltipVerticalBelow = interpolate(position, {
        inputRange: [0, 1],
        outputRange: [-margin - this.tooltipHeight / 2, 0],
        extrapolate: Extrapolate.CLAMP,
      });

      this.tooltipHorizontal = multiply(
        add(1, multiply(-1, position)),
        this.tooltipHorizontalOffset,
      );
    }

    componentDidMount() {
      if (Platform.OS === 'ios') {
        TapticFeedback.impact();
      }
    }

    get entries(): $ReadOnlyArray<TooltipEntry<RouteName>> {
      const { entries } = tooltipSpec;
      const { visibleEntryIDs } = this.props.route.params;
      if (!visibleEntryIDs) {
        return entries;
      }
      const visibleSet = new Set(visibleEntryIDs);
      return entries.filter((entry) => visibleSet.has(entry.id));
    }

    get tooltipHeight(): number {
      return tooltipHeight(this.entries.length);
    }

    get location(): 'above' | 'below' {
      const { params } = this.props.route;
      const { location } = params;
      if (location) {
        return location;
      }

      const { initialCoordinates, verticalBounds } = params;
      const { y, height } = initialCoordinates;
      const contentTop = y;
      const contentBottom = y + height;
      const boundsTop = verticalBounds.y;
      const boundsBottom = verticalBounds.y + verticalBounds.height;

      const { margin, tooltipHeight: curTooltipHeight } = this;
      const fullHeight = curTooltipHeight + margin;
      if (
        contentBottom + fullHeight > boundsBottom &&
        contentTop - fullHeight > boundsTop
      ) {
        return 'above';
      }

      return 'below';
    }

    get opacityStyle() {
      return {
        ...styles.backdrop,
        opacity: this.backdropOpacity,
      };
    }

    get contentContainerStyle() {
      const { verticalBounds } = this.props.route.params;
      const fullScreenHeight = this.props.dimensions.height;
      const top = verticalBounds.y;
      const bottom =
        fullScreenHeight - verticalBounds.y - verticalBounds.height;
      return {
        ...styles.contentContainer,
        marginTop: top,
        marginBottom: bottom,
      };
    }

    get buttonStyle() {
      const { params } = this.props.route;
      const { initialCoordinates, verticalBounds } = params;
      const { x, y, width, height } = initialCoordinates;
      return {
        width: Math.ceil(width),
        height: Math.ceil(height),
        marginTop: y - verticalBounds.y,
        marginLeft: x,
      };
    }

    get margin() {
      const customMargin = this.props.route.params.margin;
      return customMargin !== null && customMargin !== undefined
        ? customMargin
        : 20;
    }

    get tooltipContainerStyle() {
      const { dimensions, route } = this.props;
      const { initialCoordinates, verticalBounds } = route.params;
      const { x, y, width, height } = initialCoordinates;
      const { margin, location } = this;

      const style = {};
      style.position = 'absolute';
      (style.alignItems = 'center'),
        (style.opacity = this.tooltipContainerOpacity);
      style.transform = [{ translateX: this.tooltipHorizontal }];

      const extraLeftSpace = x;
      const extraRightSpace = dimensions.width - width - x;
      if (extraLeftSpace < extraRightSpace) {
        style.left = 0;
        style.minWidth = width + 2 * extraLeftSpace;
      } else {
        style.right = 0;
        style.minWidth = width + 2 * extraRightSpace;
      }

      if (location === 'above') {
        const fullScreenHeight = dimensions.height;
        style.bottom =
          fullScreenHeight - Math.max(y, verticalBounds.y) + margin;
        style.transform.push({ translateY: this.tooltipVerticalAbove });
      } else {
        style.top =
          Math.min(y + height, verticalBounds.y + verticalBounds.height) +
          margin;
        style.transform.push({ translateY: this.tooltipVerticalBelow });
      }

      const { overlayContext } = this.props;
      invariant(overlayContext, 'Tooltip should have OverlayContext');
      const { position } = overlayContext;
      style.transform.push({ scale: position });

      return style;
    }

    render() {
      const { navigation, route, dimensions } = this.props;

      const { entries } = this;
      const items = entries.map((entry, index) => {
        const style = index !== entries.length - 1 ? styles.itemMargin : null;
        return (
          <TooltipItem
            key={index}
            spec={entry}
            onPress={this.onPressEntry}
            containerStyle={style}
            labelStyle={tooltipSpec.labelStyle}
          />
        );
      });

      let triangleStyle;
      const { initialCoordinates } = route.params;
      const { x, width } = initialCoordinates;
      const extraLeftSpace = x;
      const extraRightSpace = dimensions.width - width - x;
      if (extraLeftSpace < extraRightSpace) {
        triangleStyle = {
          alignSelf: 'flex-start',
          left: extraLeftSpace + (width - 20) / 2,
        };
      } else {
        triangleStyle = {
          alignSelf: 'flex-end',
          right: extraRightSpace + (width - 20) / 2,
        };
      }

      let triangleDown = null;
      let triangleUp = null;
      const { location } = this;
      if (location === 'above') {
        triangleDown = <View style={[styles.triangleDown, triangleStyle]} />;
      } else {
        triangleUp = <View style={[styles.triangleUp, triangleStyle]} />;
      }

      const { overlayContext } = this.props;
      invariant(overlayContext, 'Tooltip should have OverlayContext');
      const { position } = overlayContext;

      return (
        <TouchableWithoutFeedback onPress={this.onPressBackdrop}>
          <View style={styles.container}>
            <Animated.View style={this.opacityStyle} />
            <View style={this.contentContainerStyle}>
              <View style={this.buttonStyle}>
                <ButtonComponent
                  navigation={navigation}
                  route={route}
                  progress={position}
                />
              </View>
            </View>
            <Animated.View
              style={this.tooltipContainerStyle}
              onLayout={this.onTooltipContainerLayout}
            >
              {triangleUp}
              <View style={styles.items}>{items}</View>
              {triangleDown}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      );
    }

    onPressBackdrop = () => {
      this.props.navigation.goBackOnce();
    };

    onPressEntry = (entry: TooltipEntry<RouteName>) => {
      this.props.navigation.goBackOnce();
      const dispatchFunctions = {
        dispatch: this.props.dispatch,
        dispatchActionPromise: this.props.dispatchActionPromise,
      };
      entry.onPress(
        this.props.route,
        dispatchFunctions,
        this.bindServerCall,
        this.props.inputState,
      );
    };

    bindServerCall = (serverCall: ActionFunc) => {
      const {
        cookie,
        urlPrefix,
        sessionID,
        currentUserInfo,
        connectionStatus,
      } = this.props.serverCallState;
      return createBoundServerCallsSelector(serverCall)({
        dispatch: this.props.dispatch,
        cookie,
        urlPrefix,
        sessionID,
        currentUserInfo,
        connectionStatus,
      });
    };

    onTooltipContainerLayout = (event: LayoutEvent) => {
      const { route, dimensions } = this.props;
      const { x, width } = route.params.initialCoordinates;

      const extraLeftSpace = x;
      const extraRightSpace = dimensions.width - width - x;

      const actualWidth = event.nativeEvent.layout.width;
      if (extraLeftSpace < extraRightSpace) {
        const minWidth = width + 2 * extraLeftSpace;
        this.tooltipHorizontalOffset.setValue((minWidth - actualWidth) / 2);
      } else {
        const minWidth = width + 2 * extraRightSpace;
        this.tooltipHorizontalOffset.setValue((actualWidth - minWidth) / 2);
      }
    };
  }
  return React.memo<BaseTooltipProps<RouteName>>(function ConnectedTooltip(
    props: BaseTooltipProps<RouteName>,
  ) {
    const dimensions = useSelector((state) => state.dimensions);
    const serverCallState = useSelector(serverCallStateSelector);
    const dispatch = useDispatch();
    const dispatchActionPromise = useDispatchActionPromise();
    const overlayContext = React.useContext(OverlayContext);
    const inputState = React.useContext(InputStateContext);
    return (
      <Tooltip
        {...props}
        dimensions={dimensions}
        serverCallState={serverCallState}
        dispatch={dispatch}
        dispatchActionPromise={dispatchActionPromise}
        overlayContext={overlayContext}
        inputState={inputState}
      />
    );
  });
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'black',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  itemContainer: {
    padding: 10,
  },
  itemMargin: {
    borderBottomColor: '#E1E1E1',
    borderBottomWidth: 1,
  },
  items: {
    backgroundColor: 'white',
    borderRadius: 5,
    overflow: 'hidden',
  },
  label: {
    color: '#444',
    fontSize: 14,
    lineHeight: 17,
    textAlign: 'center',
  },
  triangleDown: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 0,
    borderLeftColor: 'transparent',
    borderLeftWidth: 10,
    borderRightColor: 'transparent',
    borderRightWidth: 10,
    borderStyle: 'solid',
    borderTopColor: 'white',
    borderTopWidth: 10,
    height: 10,
    top: Platform.OS === 'android' ? -1 : 0,
    width: 10,
  },
  triangleUp: {
    borderBottomColor: 'white',
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderLeftWidth: 10,
    borderRightColor: 'transparent',
    borderRightWidth: 10,
    borderStyle: 'solid',
    borderTopColor: 'transparent',
    borderTopWidth: 0,
    bottom: Platform.OS === 'android' ? -1 : 0,
    height: 10,
    width: 10,
  },
});

function tooltipHeight(numEntries: number) {
  // 10 (triangle) + 37 * numEntries (entries) + numEntries - 1 (padding)
  return 9 + 38 * numEntries;
}

export { createTooltip, tooltipHeight };

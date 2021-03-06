// @flow

import { type ThreadInfo, threadInfoPropType } from 'lib/types/thread-types';
import type { AppState } from '../redux/redux-setup';
import type { ChatNavigationProp } from './chat.react';

import * as React from 'react';
import Icon from 'react-native-vector-icons/Ionicons';
import PropTypes from 'prop-types';

import { connect } from 'lib/utils/redux-utils';

import { ThreadSettingsRouteName } from '../navigation/route-names';
import Button from '../components/button.react';
import { styleSelector } from '../themes/colors';

type Props = {|
  threadInfo: ThreadInfo,
  navigate: $PropertyType<ChatNavigationProp<'MessageList'>, 'navigate'>,
  // Redux state
  styles: typeof styles,
|};
class ThreadSettingsButton extends React.PureComponent<Props> {
  static propTypes = {
    threadInfo: threadInfoPropType.isRequired,
    navigate: PropTypes.func.isRequired,
    styles: PropTypes.objectOf(PropTypes.object).isRequired,
  };

  render() {
    return (
      <Button onPress={this.onPress} androidBorderlessRipple={true}>
        <Icon name="md-settings" size={30} style={this.props.styles.button} />
      </Button>
    );
  }

  onPress = () => {
    const threadInfo = this.props.threadInfo;
    this.props.navigate({
      name: ThreadSettingsRouteName,
      params: { threadInfo },
      key: `${ThreadSettingsRouteName}${threadInfo.id}`,
    });
  };
}

const styles = {
  button: {
    color: 'link',
    paddingHorizontal: 10,
  },
};
const stylesSelector = styleSelector(styles);

export default connect((state: AppState) => ({
  styles: stylesSelector(state),
}))(ThreadSettingsButton);

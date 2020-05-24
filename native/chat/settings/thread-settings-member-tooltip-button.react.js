// @flow

import type { AppNavigationProp } from '../../navigation/app-navigator.react';

import * as React from 'react';
import { TouchableOpacity } from 'react-native';
import PropTypes from 'prop-types';

import PencilIcon from './pencil-icon.react';

type Props = {
  navigation: AppNavigationProp<'ThreadSettingsMemberTooltipModal'>,
};
class ThreadSettingsMemberTooltipButton extends React.PureComponent<Props> {
  static propTypes = {
    navigation: PropTypes.shape({
      goBack: PropTypes.func.isRequired,
    }).isRequired,
  };

  render() {
    return (
      <TouchableOpacity onPress={this.onPress}>
        <PencilIcon />
      </TouchableOpacity>
    );
  }

  onPress = () => {
    this.props.navigation.goBack();
  };
}

export default ThreadSettingsMemberTooltipButton;

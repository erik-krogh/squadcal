// @flow

import type { AccountUserInfo } from 'lib/types/user-types';
import type { UserSearchResult } from 'lib/types/search-types';
import type { DispatchActionPromise } from 'lib/utils/action-utils';
import type { RootNavigationProp } from '../navigation/root-navigator.react';
import type { NavigationRoute } from '../navigation/route-names';
import type { AppState } from '../redux/redux-setup';

import * as React from 'react';
import { Text, View } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { createSelector } from 'reselect';
import _keyBy from 'lodash/fp/keyBy';

import { searchIndexFromUserInfos } from 'lib/selectors/user-selectors';
import { registerFetchKey } from 'lib/reducers/loading-reducer';
import { getUserSearchResults } from 'lib/shared/search-utils';
import { connect } from 'lib/utils/redux-utils';
import { searchUsersActionTypes, searchUsers } from 'lib/actions/user-actions';

import UserList from '../components/user-list.react';
import Modal from '../components/modal.react';
import Button from '../components/button.react';
import TagInput from '../components/tag-input.react';
import { styleSelector } from '../themes/colors';

const tagInputProps = {
  placeholder: 'Select users to invite',
  autoFocus: true,
  returnKeyType: 'go',
};

type Props = {|
  navigation: RootNavigationProp<'AddFriendsModal'>,
  route: NavigationRoute<'AddFriendsModal'>,
  // Redux state
  viewerID: ?string,
  styles: typeof styles,
  // Redux dispatch functions
  dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  searchUsers: (usernamePrefix: string) => Promise<UserSearchResult>,
  sendFriendRequest: (userIDs: string[]) => Promise<void>,
|};

type State = {|
  usernameInputText: string,
  userInfoInputArray: $ReadOnlyArray<AccountUserInfo>,
  userInfos: { [id: string]: AccountUserInfo },
|};

type PropsAndState = {| ...Props, ...State |};

class AddFriendsModal extends React.PureComponent<Props, State> {
  state = {
    usernameInputText: '',
    userInfoInputArray: [],
    userInfos: {},
  };
  tagInput: ?TagInput<AccountUserInfo> = null;

  componentDidMount() {
    this.searchUsers('');
  }

  async searchUsers(usernamePrefix: string) {
    const { userInfos } = await this.props.searchUsers(usernamePrefix);
    this.setState({ userInfos: _keyBy(userInfo => userInfo.id)(userInfos) });
  }

  userSearchResultsSelector = createSelector(
    (propsAndState: PropsAndState) => propsAndState.usernameInputText,
    (propsAndState: PropsAndState) => propsAndState.userInfos,
    (propsAndState: PropsAndState) => propsAndState.viewerID,
    (propsAndState: PropsAndState) => propsAndState.userInfoInputArray,
    (
      text: string,
      userInfos: { [id: string]: AccountUserInfo },
      viewerID: ?string,
      userInfoInputArray: $ReadOnlyArray<AccountUserInfo>,
    ) => {
      // TODO: exclude current and blocked friends
      const excludeUserIDs = userInfoInputArray
        .map(userInfo => userInfo.id)
        .concat(viewerID || []);
      const searchIndex = searchIndexFromUserInfos(userInfos);
      return getUserSearchResults(text, userInfos, searchIndex, excludeUserIDs);
    },
  );

  get userSearchResults() {
    return this.userSearchResultsSelector({ ...this.props, ...this.state });
  }

  render() {
    let addButton = null;
    const inputLength = this.state.userInfoInputArray.length;
    if (inputLength > 0) {
      const addButtonText = `Add (${inputLength})`;
      addButton = (
        <Button onPress={this.onPressAdd} style={this.props.styles.addButton}>
          <Text style={this.props.styles.addText}>{addButtonText}</Text>
        </Button>
      );
    }

    const inputProps = {
      ...tagInputProps,
      onSubmitEditing: this.onPressAdd,
    };

    return (
      <Modal navigation={this.props.navigation}>
        <TagInput
          value={this.state.userInfoInputArray}
          onChange={this.onChangeTagInput}
          text={this.state.usernameInputText}
          onChangeText={this.setUsernameInputText}
          labelExtractor={this.tagDataLabelExtractor}
          defaultInputWidth={160}
          maxHeight={36}
          inputProps={inputProps}
          innerRef={this.tagInputRef}
        />
        <UserList
          userInfos={this.userSearchResults}
          onSelect={this.onUserSelect}
        />
        <View style={this.props.styles.buttons}>
          <Button onPress={this.close} style={this.props.styles.cancelButton}>
            <Text style={this.props.styles.cancelText}>Cancel</Text>
          </Button>
          {addButton}
        </View>
      </Modal>
    );
  }

  tagInputRef = (tagInput: ?TagInput<AccountUserInfo>) => {
    this.tagInput = tagInput;
  };

  tagDataLabelExtractor = (userInfo: AccountUserInfo) => userInfo.username;

  setUsernameInputText = (text: string) => {
    this.searchUsers(text);
    this.setState({ usernameInputText: text });
  };

  onChangeTagInput = (userInfoInputArray: $ReadOnlyArray<AccountUserInfo>) => {
    this.setState({ userInfoInputArray });
  };

  onUserSelect = (userID: string) => {
    if (this.state.userInfoInputArray.find(o => o.id === userID)) {
      return;
    }

    const selectedUserInfo = this.state.userInfos[userID];

    this.setState(state => ({
      userInfoInputArray: state.userInfoInputArray.concat(selectedUserInfo),
      usernameInputText: '',
    }));
  };

  onPressAdd = () => {
    if (this.state.userInfoInputArray.length === 0) {
      return;
    }

    this.props.navigation.goBack();
  };

  goBackOnce() {
    this.props.navigation.dispatch(state => ({
      ...CommonActions.goBack(),
      target: state.key,
    }));
  }

  close = () => {
    this.goBackOnce();
  };
}

const styles = {
  activityIndicator: {
    paddingRight: 6,
  },
  addButton: {
    backgroundColor: 'greenButton',
    borderRadius: 3,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  addText: {
    color: 'white',
    fontSize: 18,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  cancelButton: {
    backgroundColor: 'modalButton',
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  cancelText: {
    color: 'modalButtonLabel',
    fontSize: 18,
  },
};
const stylesSelector = styleSelector(styles);

registerFetchKey(searchUsersActionTypes);

export default connect(
  (state: AppState) => {
    return {
      viewerID: state.currentUserInfo && state.currentUserInfo.id,
      styles: stylesSelector(state),
    };
  },
  { searchUsers },
)(AddFriendsModal);

// @flow

import {
  type ThreadInfo,
  threadInfoPropType,
  threadTypes,
  assertThreadType,
  type ChangeThreadSettingsPayload,
  type UpdateThreadRequest,
  type LeaveThreadPayload,
  threadPermissions,
  type ThreadChanges,
} from 'lib/types/thread-types';
import type { AppState } from '../../redux-setup';
import type { DispatchActionPromise } from 'lib/utils/action-utils';
import { type UserInfo, userInfoPropType } from 'lib/types/user-types';

import * as React from 'react';
import classNames from 'classnames';
import invariant from 'invariant';
import PropTypes from 'prop-types';
import _pickBy from 'lodash/fp/pickBy';

import { connect } from 'lib/utils/redux-utils';
import {
  deleteThreadActionTypes,
  deleteThread,
  changeThreadSettingsActionTypes,
  changeThreadSettings,
} from 'lib/actions/thread-actions';
import { createLoadingStatusSelector } from 'lib/selectors/loading-selectors';
import {
  threadHasPermission,
  threadTypeDescriptions,
  robotextName,
} from 'lib/shared/thread-utils';

import css from '../../style.css';
import Modal from '../modal.react';
import ColorPicker from './color-picker.react';

type TabType = 'general' | 'privacy' | 'delete';
type TabProps = {
  name: string,
  tabType: TabType,
  selected: boolean,
  onClick: (tabType: TabType) => void,
};
class Tab extends React.PureComponent<TabProps> {
  render() {
    const classNamesForTab = classNames({
      [css['current-tab']]: this.props.selected,
      [css['delete-tab']]:
        this.props.selected && this.props.tabType === 'delete',
    });
    return (
      <li className={classNamesForTab} onClick={this.onClick}>
        <a>{this.props.name}</a>
      </li>
    );
  }

  onClick = () => {
    return this.props.onClick(this.props.tabType);
  };
}

type Props = {
  threadInfo: ThreadInfo,
  onClose: () => void,
  // Redux state
  inputDisabled: boolean,
  viewerID: ?string,
  userInfos: { [id: string]: UserInfo },
  // Redux dispatch functions
  dispatchActionPromise: DispatchActionPromise,
  // async functions that hit server APIs
  deleteThread: (
    threadID: string,
    currentAccountPassword: string,
  ) => Promise<LeaveThreadPayload>,
  changeThreadSettings: (
    update: UpdateThreadRequest,
  ) => Promise<ChangeThreadSettingsPayload>,
};
type State = {|
  queuedChanges: ThreadChanges,
  errorMessage: string,
  accountPassword: string,
  currentTabType: TabType,
|};
class ThreadSettingsModal extends React.PureComponent<Props, State> {
  nameInput: ?HTMLInputElement;
  newThreadPasswordInput: ?HTMLInputElement;
  accountPasswordInput: ?HTMLInputElement;

  constructor(props: Props) {
    super(props);
    this.state = {
      queuedChanges: {},
      errorMessage: '',
      accountPassword: '',
      currentTabType: 'general',
    };
  }

  componentDidMount() {
    invariant(this.nameInput, 'nameInput ref unset');
    this.nameInput.focus();
  }

  possiblyChangedValue(key: string) {
    const valueChanged =
      this.state.queuedChanges[key] !== null &&
      this.state.queuedChanges[key] !== undefined;
    return valueChanged
      ? this.state.queuedChanges[key]
      : this.props.threadInfo[key];
  }

  namePlaceholder() {
    return robotextName(
      this.props.threadInfo,
      this.props.viewerID,
      this.props.userInfos,
    );
  }

  changeQueued() {
    return (
      Object.keys(
        _pickBy(
          value => value !== null && value !== undefined,
          // the lodash/fp libdef coerces the returned object's properties to the
          // same type, which means it only works for object-as-maps $FlowFixMe
        )(this.state.queuedChanges),
      ).length > 0
    );
  }

  render() {
    let mainContent = null;
    if (this.state.currentTabType === 'general') {
      mainContent = (
        <div>
          <div>
            <div className={css['form-title']}>Thread name</div>
            <div className={css['form-content']}>
              <input
                type="text"
                value={this.possiblyChangedValue('name')}
                placeholder={this.namePlaceholder()}
                onChange={this.onChangeName}
                disabled={this.props.inputDisabled}
                ref={this.nameInputRef}
              />
            </div>
          </div>
          <div className={css['form-textarea-container']}>
            <div className={css['form-title']}>Description</div>
            <div className={css['form-content']}>
              <textarea
                value={this.possiblyChangedValue('description')}
                placeholder="Thread description"
                onChange={this.onChangeDescription}
                disabled={this.props.inputDisabled}
              ></textarea>
            </div>
          </div>
          <div className={css['edit-thread-color-container']}>
            <div className={`${css['form-title']} ${css['color-title']}`}>
              Color
            </div>
            <div className={css['form-content']}>
              <ColorPicker
                id="edit-thread-color"
                value={this.possiblyChangedValue('color')}
                disabled={this.props.inputDisabled}
                onChange={this.onChangeColor}
              />
            </div>
          </div>
        </div>
      );
    } else if (this.state.currentTabType === 'privacy') {
      let threadTypeSection = null;
      if (this.possiblyChangedValue('parentThreadID')) {
        threadTypeSection = (
          <div className={css['modal-radio-selector']}>
            <div className={css['form-title']}>Thread type</div>
            <div className={css['form-enum-selector']}>
              <div className={css['form-enum-container']}>
                <input
                  type="radio"
                  name="edit-thread-type"
                  id="edit-thread-open"
                  value={threadTypes.CHAT_NESTED_OPEN}
                  checked={
                    this.possiblyChangedValue('type') ===
                    threadTypes.CHAT_NESTED_OPEN
                  }
                  onChange={this.onChangeThreadType}
                  disabled={this.props.inputDisabled}
                />
                <div className={css['form-enum-option']}>
                  <label htmlFor="edit-thread-open">
                    Open
                    <span className={css['form-enum-description']}>
                      {threadTypeDescriptions[threadTypes.CHAT_NESTED_OPEN]}
                    </span>
                  </label>
                </div>
              </div>
              <div className={css['form-enum-container']}>
                <input
                  type="radio"
                  name="edit-thread-type"
                  id="edit-thread-closed"
                  value={threadTypes.CHAT_SECRET}
                  checked={
                    this.possiblyChangedValue('type') ===
                    threadTypes.CHAT_SECRET
                  }
                  onChange={this.onChangeThreadType}
                  disabled={this.props.inputDisabled}
                />
                <div className={css['form-enum-option']}>
                  <label htmlFor="edit-thread-closed">
                    Secret
                    <span className={css['form-enum-description']}>
                      {threadTypeDescriptions[threadTypes.CHAT_SECRET]}
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        );
      }
      mainContent = (
        <div className={css['edit-thread-privacy-container']}>
          {threadTypeSection}
        </div>
      );
    } else if (this.state.currentTabType === 'delete') {
      mainContent = (
        <div>
          <p className={css['italic']}>
            Your thread will be permanently deleted. There is no way to reverse
            this.
          </p>
        </div>
      );
    }

    let buttons = null;
    if (this.state.currentTabType === 'delete') {
      buttons = (
        <span className={css['form-submit']}>
          <input
            type="submit"
            value="Delete"
            onClick={this.onDelete}
            disabled={this.props.inputDisabled}
          />
        </span>
      );
    } else {
      buttons = (
        <span className={css['form-submit']}>
          <input
            type="submit"
            value="Save"
            onClick={this.onSubmit}
            disabled={this.props.inputDisabled || !this.changeQueued()}
          />
        </span>
      );
    }

    const canDeleteThread = threadHasPermission(
      this.props.threadInfo,
      threadPermissions.DELETE_THREAD,
    );
    let deleteTab = null;
    if (canDeleteThread) {
      deleteTab = (
        <Tab
          name="Delete"
          tabType="delete"
          onClick={this.setTab}
          selected={this.state.currentTabType === 'delete'}
          key="delete"
        />
      );
    }

    return (
      <Modal name="Thread settings" onClose={this.props.onClose} size="large">
        <ul className={css['tab-panel']}>
          <Tab
            name="General"
            tabType="general"
            onClick={this.setTab}
            selected={this.state.currentTabType === 'general'}
            key="general"
          />
          <Tab
            name="Privacy"
            tabType="privacy"
            onClick={this.setTab}
            selected={this.state.currentTabType === 'privacy'}
            key="privacy"
          />
          {deleteTab}
        </ul>
        <div className={css['modal-body']}>
          <form method="POST">
            {mainContent}
            <div className={css['edit-thread-account-password']}>
              <p className={css['confirm-account-password']}>
                Please enter your account password to confirm your identity
              </p>
              <div className={css['form-title']}>Account password</div>
              <div className={css['form-content']}>
                <input
                  type="password"
                  placeholder="Personal account password"
                  value={this.state.accountPassword}
                  onChange={this.onChangeAccountPassword}
                  disabled={this.props.inputDisabled}
                  ref={this.accountPasswordInputRef}
                />
              </div>
            </div>
            <div className={css['form-footer']}>
              <span className={css['modal-form-error']}>
                {this.state.errorMessage}
              </span>
              {buttons}
            </div>
          </form>
        </div>
      </Modal>
    );
  }

  setTab = (tabType: TabType) => {
    this.setState({ currentTabType: tabType });
  };

  nameInputRef = (nameInput: ?HTMLInputElement) => {
    this.nameInput = nameInput;
  };

  newThreadPasswordInputRef = (newThreadPasswordInput: ?HTMLInputElement) => {
    this.newThreadPasswordInput = newThreadPasswordInput;
  };

  accountPasswordInputRef = (accountPasswordInput: ?HTMLInputElement) => {
    this.accountPasswordInput = accountPasswordInput;
  };

  onChangeName = (event: SyntheticEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    const newValue =
      target.value !== this.props.threadInfo.name ? target.value : undefined;
    this.setState((prevState: State) => ({
      ...prevState,
      queuedChanges: {
        ...prevState.queuedChanges,
        name: newValue,
      },
    }));
  };

  onChangeDescription = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    const target = event.currentTarget;
    const newValue =
      target.value !== this.props.threadInfo.description
        ? target.value
        : undefined;
    this.setState((prevState: State) => ({
      ...prevState,
      queuedChanges: {
        ...prevState.queuedChanges,
        description: newValue,
      },
    }));
  };

  onChangeColor = (color: string) => {
    const newValue = color !== this.props.threadInfo.color ? color : undefined;
    this.setState((prevState: State) => ({
      ...prevState,
      queuedChanges: {
        ...prevState.queuedChanges,
        color: newValue,
      },
    }));
  };

  onChangeThreadType = (event: SyntheticEvent<HTMLInputElement>) => {
    const uiValue = assertThreadType(parseInt(event.currentTarget.value, 10));
    const newValue =
      uiValue !== this.props.threadInfo.type ? uiValue : undefined;
    this.setState((prevState: State) => ({
      ...prevState,
      queuedChanges: {
        ...prevState.queuedChanges,
        type: newValue,
      },
    }));
  };

  onChangeAccountPassword = (event: SyntheticEvent<HTMLInputElement>) => {
    const target = event.currentTarget;
    this.setState({ accountPassword: target.value });
  };

  onSubmit = (event: SyntheticEvent<HTMLInputElement>) => {
    event.preventDefault();
    this.props.dispatchActionPromise(
      changeThreadSettingsActionTypes,
      this.changeThreadSettingsAction(),
    );
  };

  async changeThreadSettingsAction() {
    try {
      const response = await this.props.changeThreadSettings({
        threadID: this.props.threadInfo.id,
        changes: this.state.queuedChanges,
        accountPassword: this.state.accountPassword
          ? this.state.accountPassword
          : null,
      });
      this.props.onClose();
      return response;
    } catch (e) {
      if (e.message === 'invalid_credentials') {
        this.setState(
          {
            accountPassword: '',
            errorMessage: 'wrong password',
          },
          () => {
            invariant(
              this.accountPasswordInput,
              'accountPasswordInput ref unset',
            );
            this.accountPasswordInput.focus();
          },
        );
      } else {
        this.setState(
          prevState => ({
            ...prevState,
            queuedChanges: {},
            accountPassword: '',
            errorMessage: 'unknown error',
            currentTabType: 'general',
          }),
          () => {
            invariant(this.nameInput, 'nameInput ref unset');
            this.nameInput.focus();
          },
        );
      }
      throw e;
    }
  }

  onDelete = (event: SyntheticEvent<HTMLInputElement>) => {
    event.preventDefault();
    this.props.dispatchActionPromise(
      deleteThreadActionTypes,
      this.deleteThreadAction(),
    );
  };

  async deleteThreadAction() {
    try {
      const response = await this.props.deleteThread(
        this.props.threadInfo.id,
        this.state.accountPassword,
      );
      this.props.onClose();
      return response;
    } catch (e) {
      const errorMessage =
        e.message === 'invalid_credentials'
          ? 'wrong password'
          : 'unknown error';
      this.setState(
        {
          accountPassword: '',
          errorMessage: errorMessage,
        },
        () => {
          invariant(
            this.accountPasswordInput,
            'accountPasswordInput ref unset',
          );
          this.accountPasswordInput.focus();
        },
      );
      throw e;
    }
  }
}

ThreadSettingsModal.propTypes = {
  threadInfo: threadInfoPropType.isRequired,
  onClose: PropTypes.func.isRequired,
  inputDisabled: PropTypes.bool.isRequired,
  viewerID: PropTypes.string,
  userInfos: PropTypes.objectOf(userInfoPropType).isRequired,
  dispatchActionPromise: PropTypes.func.isRequired,
  deleteThread: PropTypes.func.isRequired,
  changeThreadSettings: PropTypes.func.isRequired,
};

const deleteThreadLoadingStatusSelector = createLoadingStatusSelector(
  deleteThreadActionTypes,
);
const changeThreadSettingsLoadingStatusSelector = createLoadingStatusSelector(
  changeThreadSettingsActionTypes,
);

export default connect(
  (state: AppState) => ({
    inputDisabled:
      deleteThreadLoadingStatusSelector(state) === 'loading' ||
      changeThreadSettingsLoadingStatusSelector(state) === 'loading',
    viewerID: state.currentUserInfo && state.currentUserInfo.id,
    userInfos: state.userStore.userInfos,
  }),
  { deleteThread, changeThreadSettings },
)(ThreadSettingsModal);

// @flow

import type { ThreadInfo } from 'lib/types/thread-types';
import type { TabNavigationProp } from '../navigation/app-navigator.react';
import type {
  ChatTopTabsNavigationProp,
  ChatNavigationProp,
} from './chat.react';
import type { UserSearchResult } from 'lib/types/search-types';
import type { GlobalAccountUserInfo, UserInfo } from 'lib/types/user-types';

import * as React from 'react';
import { View, FlatList, Platform, TextInput, Text } from 'react-native';
import IonIcon from 'react-native-vector-icons/Ionicons';
import _sum from 'lodash/fp/sum';
import { FloatingAction } from 'react-native-floating-action';
import { createSelector } from 'reselect';
import invariant from 'invariant';

import { threadSearchIndex as threadSearchIndexSelector } from 'lib/selectors/nav-selectors';
import SearchIndex from 'lib/shared/search-index';
import {
  type ChatThreadItem,
  chatListDataWithNestedSidebars,
} from 'lib/selectors/chat-selectors';
import { usersWithPersonalThreadSelector } from 'lib/selectors/user-selectors';
import { threadPermissions, threadTypes } from 'lib/types/thread-types';
import { createPendingThreadItem } from 'lib/shared/thread-utils';
import { searchUsers } from 'lib/actions/user-actions';

import ChatThreadListItem from './chat-thread-list-item.react';
import {
  ComposeThreadRouteName,
  MessageListRouteName,
  SidebarListModalRouteName,
  HomeChatThreadListRouteName,
  BackgroundChatThreadListRouteName,
  type NavigationRoute,
} from '../navigation/route-names';
import {
  type IndicatorStyle,
  indicatorStyleSelector,
  useStyles,
} from '../themes/colors';
import Search from '../components/search.react';
import Button from '../components/button.react';
import { useSelector } from '../redux/redux-utils';
import { useServerCall } from 'lib/utils/action-utils';

const floatingActions = [
  {
    text: 'Compose',
    icon: <IonIcon name="md-create" size={24} color="#FFFFFF" />,
    name: 'compose',
    position: 1,
  },
];

type Item =
  | ChatThreadItem
  | {| +type: 'search', +searchText: string |}
  | {| +type: 'empty', +emptyItem: React.ComponentType<{||}> |};

type BaseProps = {|
  +navigation:
    | ChatTopTabsNavigationProp<'HomeChatThreadList'>
    | ChatTopTabsNavigationProp<'BackgroundChatThreadList'>,
  +route:
    | NavigationRoute<'HomeChatThreadList'>
    | NavigationRoute<'BackgroundChatThreadList'>,
  +filterThreads: (threadItem: ThreadInfo) => boolean,
  +emptyItem?: React.ComponentType<{||}>,
|};
type Props = {|
  ...BaseProps,
  // Redux state
  +chatListData: $ReadOnlyArray<ChatThreadItem>,
  +viewerID: ?string,
  +threadSearchIndex: SearchIndex,
  +styles: typeof unboundStyles,
  +indicatorStyle: IndicatorStyle,
  +usersWithPersonalThread: $ReadOnlySet<string>,
  // async functions that hit server APIs
  +searchUsers: (usernamePrefix: string) => Promise<UserSearchResult>,
|};
type State = {|
  +searchText: string,
  +threadsSearchResults: Set<string>,
  +usersSearchResult: $ReadOnlyArray<GlobalAccountUserInfo>,
  +openedSwipeableId: string,
|};
type PropsAndState = {| ...Props, ...State |};
class ChatThreadList extends React.PureComponent<Props, State> {
  state = {
    searchText: '',
    threadsSearchResults: new Set(),
    usersSearchResult: [],
    openedSwipeableId: '',
  };
  searchInput: ?React.ElementRef<typeof TextInput>;
  flatList: ?FlatList<Item>;
  scrollPos = 0;

  componentDidMount() {
    const chatNavigation: ?ChatNavigationProp<
      'ChatThreadList',
    > = this.props.navigation.dangerouslyGetParent();
    invariant(chatNavigation, 'ChatNavigator should be within TabNavigator');
    const tabNavigation: ?TabNavigationProp<
      'Chat',
    > = chatNavigation.dangerouslyGetParent();
    invariant(tabNavigation, 'ChatNavigator should be within TabNavigator');
    tabNavigation.addListener('tabPress', this.onTabPress);
  }

  componentWillUnmount() {
    const chatNavigation: ?ChatNavigationProp<
      'ChatThreadList',
    > = this.props.navigation.dangerouslyGetParent();
    invariant(chatNavigation, 'ChatNavigator should be within TabNavigator');
    const tabNavigation: ?TabNavigationProp<
      'Chat',
    > = chatNavigation.dangerouslyGetParent();
    invariant(tabNavigation, 'ChatNavigator should be within TabNavigator');
    tabNavigation.removeListener('tabPress', this.onTabPress);
  }

  onTabPress = () => {
    if (!this.props.navigation.isFocused()) {
      return;
    }
    if (this.scrollPos > 0 && this.flatList) {
      this.flatList.scrollToOffset({ offset: 0, animated: true });
    } else if (this.props.route.name === BackgroundChatThreadListRouteName) {
      this.props.navigation.navigate({ name: HomeChatThreadListRouteName });
    }
  };

  renderItem = (row: { item: Item }) => {
    const item = row.item;
    if (item.type === 'search') {
      return (
        <Search
          searchText={this.state.searchText}
          onChangeText={this.onChangeSearchText}
          containerStyle={this.props.styles.search}
          placeholder="Search threads"
          ref={this.searchInputRef}
        />
      );
    }
    if (item.type === 'empty') {
      const EmptyItem = item.emptyItem;
      return <EmptyItem />;
    }
    return (
      <ChatThreadListItem
        data={item}
        onPressItem={this.onPressItem}
        onPressSeeMoreSidebars={this.onPressSeeMoreSidebars}
        onSwipeableWillOpen={this.onSwipeableWillOpen}
        currentlyOpenedSwipeableId={this.state.openedSwipeableId}
      />
    );
  };

  searchInputRef = (searchInput: ?React.ElementRef<typeof TextInput>) => {
    this.searchInput = searchInput;
  };

  static keyExtractor(item: Item) {
    if (item.type === 'chatThreadItem') {
      return item.threadInfo.id;
    } else if (item.type === 'empty') {
      return 'empty';
    } else {
      return 'search';
    }
  }

  static getItemLayout(data: ?$ReadOnlyArray<Item>, index: number) {
    if (!data) {
      return { length: 0, offset: 0, index };
    }
    const offset = ChatThreadList.heightOfItems(
      data.filter((_, i) => i < index),
    );
    const item = data[index];
    const length = item ? ChatThreadList.itemHeight(item) : 0;
    return { length, offset, index };
  }

  static itemHeight(item: Item): number {
    if (item.type === 'search') {
      return Platform.OS === 'ios' ? 54.5 : 55;
    }

    // itemHeight for emptyItem might be wrong because of line wrapping
    // but we don't care because we'll only ever be rendering this item by itself
    // and it should always be on-screen
    if (item.type === 'empty') {
      return 123;
    }

    return 60 + item.sidebars.length * 30;
  }

  static heightOfItems(data: $ReadOnlyArray<Item>): number {
    return _sum(data.map(ChatThreadList.itemHeight));
  }

  listDataSelector = createSelector(
    (propsAndState: PropsAndState) => propsAndState.chatListData,
    (propsAndState: PropsAndState) => propsAndState.searchText,
    (propsAndState: PropsAndState) => propsAndState.threadsSearchResults,
    (propsAndState: PropsAndState) => propsAndState.emptyItem,
    (propsAndState: PropsAndState) => propsAndState.usersSearchResult,
    (
      reduxChatListData: $ReadOnlyArray<ChatThreadItem>,
      searchText: string,
      threadsSearchResults: Set<string>,
      emptyItem?: React.ComponentType<{||}>,
      usersSearchResult: $ReadOnlyArray<GlobalAccountUserInfo>,
    ): Item[] => {
      const chatItems = [];
      if (!searchText) {
        chatItems.push(
          ...reduxChatListData.filter((item) =>
            this.props.filterThreads(item.threadInfo),
          ),
        );
      } else {
        chatItems.push(
          ...reduxChatListData.filter((item) =>
            threadsSearchResults.has(item.threadInfo.id),
          ),
        );
      }
      const viewerID = this.props.viewerID;
      if (viewerID) {
        chatItems.push(
          ...usersSearchResult.map((user) =>
            createPendingThreadItem(viewerID, user),
          ),
        );
      }
      if (emptyItem && chatItems.length === 0) {
        chatItems.push({ type: 'empty', emptyItem });
      }
      return [{ type: 'search', searchText }, ...chatItems];
    },
  );

  get listData() {
    return this.listDataSelector({ ...this.props, ...this.state });
  }

  render() {
    let floatingAction = null;
    if (Platform.OS === 'android') {
      floatingAction = (
        <FloatingAction
          actions={floatingActions}
          overrideWithAction
          onPressItem={this.composeThread}
          color="#66AA66"
        />
      );
    }
    // this.props.viewerID is in extraData since it's used by MessagePreview
    // within ChatThreadListItem
    return (
      <View style={this.props.styles.container}>
        {[
          {
            id: '123650',
            username: 'NoRelationship',
          },
          {
            id: '123669',
            username: 'BlockedTest1',
          },
          {
            id: '123690',
            username: 'BlockedByTest1',
          },
          {
            id: '123713',
            username: 'BlockedByAndBlocksTest1',
          },
          {
            id: '123738',
            username: 'RequestedTest1',
          },
          {
            id: '123759',
            username: 'RequestedByTest1',
          },
          {
            id: '123778',
            username: 'FriendOfTest1',
          },
        ].map(({ id, username }) => (
          <Button
            key={id}
            onPress={() =>
              this.props.navigation.navigate({
                name: MessageListRouteName,
                params: {
                  threadInfo: {
                    id: `pending/${id}`,
                    type: threadTypes.PERSONAL,
                    name: 'Pending thread',
                    uiName: username,
                    description: "It's a pending thread",
                    color: 'ff0000',
                    creationTime: Date.now(),
                    parentThreadID: null,
                    members: [],
                    roles: {},
                    currentUser: {
                      role: null,
                      permissions: {
                        [threadPermissions.VOICED]: {
                          value: true,
                          source: '',
                        },
                      },
                      subscription: {
                        pushNotifs: false,
                        home: false,
                      },
                      unread: false,
                    },
                  },
                  pendingPersonalThreadUserInfo: {
                    id,
                    username,
                  },
                },
                key: `${MessageListRouteName}/pending/${id}`,
              })
            }
          >
            <Text>{username}</Text>
          </Button>
        ))}
        <FlatList
          data={this.listData}
          renderItem={this.renderItem}
          keyExtractor={ChatThreadList.keyExtractor}
          getItemLayout={ChatThreadList.getItemLayout}
          extraData={`${this.props.viewerID || ''} ${
            this.state.openedSwipeableId
          }`}
          initialNumToRender={11}
          keyboardShouldPersistTaps="handled"
          onScroll={this.onScroll}
          style={this.props.styles.flatList}
          indicatorStyle={this.props.indicatorStyle}
          ref={this.flatListRef}
        />
        {floatingAction}
      </View>
    );
  }

  flatListRef = (flatList: ?FlatList<Item>) => {
    this.flatList = flatList;
  };

  onScroll = (event: { +nativeEvent: { +contentOffset: { +y: number } } }) => {
    this.scrollPos = event.nativeEvent.contentOffset.y;
  };

  async searchUsers(usernamePrefix: string) {
    if (usernamePrefix.length === 0) {
      return [];
    }

    const { userInfos } = await this.props.searchUsers(usernamePrefix);
    return userInfos.filter(
      (info) => !this.props.usersWithPersonalThread.has(info.id),
    );
  }

  onChangeSearchText = async (searchText: string) => {
    const results = this.props.threadSearchIndex.getSearchResults(searchText);
    this.setState({ searchText, threadsSearchResults: new Set(results) });
    const usersSearchResult = await this.searchUsers(searchText);
    this.setState({ usersSearchResult });
  };

  onPressItem = (
    threadInfo: ThreadInfo,
    pendingPersonalThreadUserInfo?: UserInfo,
  ) => {
    this.onChangeSearchText('');
    if (this.searchInput) {
      this.searchInput.blur();
    }
    this.props.navigation.navigate({
      name: MessageListRouteName,
      params: { threadInfo, pendingPersonalThreadUserInfo },
      key: `${MessageListRouteName}${threadInfo.id}`,
    });
  };

  onPressSeeMoreSidebars = (threadInfo: ThreadInfo) => {
    this.onChangeSearchText('');
    if (this.searchInput) {
      this.searchInput.blur();
    }
    this.props.navigation.navigate({
      name: SidebarListModalRouteName,
      params: { threadInfo },
    });
  };

  onSwipeableWillOpen = (threadInfo: ThreadInfo) => {
    this.setState((state) => ({ ...state, openedSwipeableId: threadInfo.id }));
  };

  composeThread = () => {
    this.props.navigation.navigate({
      name: ComposeThreadRouteName,
      params: {},
    });
  };
}

const unboundStyles = {
  icon: {
    fontSize: 28,
  },
  container: {
    flex: 1,
  },
  search: {
    marginBottom: 8,
    marginHorizontal: 12,
    marginTop: Platform.OS === 'android' ? 10 : 8,
  },
  flatList: {
    flex: 1,
    backgroundColor: 'listBackground',
  },
};

export default React.memo<BaseProps>(function ConnectedChatThreadList(
  props: BaseProps,
) {
  const chatListData = useSelector(chatListDataWithNestedSidebars);
  const viewerID = useSelector(
    (state) => state.currentUserInfo && state.currentUserInfo.id,
  );
  const threadSearchIndex = useSelector(threadSearchIndexSelector);
  const styles = useStyles(unboundStyles);
  const indicatorStyle = useSelector(indicatorStyleSelector);
  const callSearchUsers = useServerCall(searchUsers);
  const usersWithPersonalThread = useSelector(usersWithPersonalThreadSelector);

  return (
    <ChatThreadList
      {...props}
      chatListData={chatListData}
      viewerID={viewerID}
      threadSearchIndex={threadSearchIndex}
      styles={styles}
      indicatorStyle={indicatorStyle}
      searchUsers={callSearchUsers}
      usersWithPersonalThread={usersWithPersonalThread}
    />
  );
});

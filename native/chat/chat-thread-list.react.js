// @flow

import type { AppState } from '../redux/redux-setup';
import type { ThreadInfo } from 'lib/types/thread-types';
import type { TabNavigationProp } from '../navigation/app-navigator.react';
import type {
  ChatTopTabsNavigationProp,
  ChatNavigationProp,
} from './chat.react';

import * as React from 'react';
import { View, FlatList, Platform, TextInput, Text } from 'react-native';
import IonIcon from 'react-native-vector-icons/Ionicons';
import PropTypes from 'prop-types';
import _sum from 'lodash/fp/sum';
import { FloatingAction } from 'react-native-floating-action';
import { createSelector } from 'reselect';
import invariant from 'invariant';

import { threadSearchIndex } from 'lib/selectors/nav-selectors';
import SearchIndex from 'lib/shared/search-index';
import { connect } from 'lib/utils/redux-utils';
import {
  type ChatThreadItem,
  chatThreadItemPropType,
  chatListDataWithNestedSidebars,
} from 'lib/selectors/chat-selectors';
import { threadPermissions, threadTypes } from 'lib/types/thread-types';

import ChatThreadListItem from './chat-thread-list-item.react';
import {
  ComposeThreadRouteName,
  MessageListRouteName,
  HomeChatThreadListRouteName,
  BackgroundChatThreadListRouteName,
  type NavigationRoute,
} from '../navigation/route-names';
import {
  styleSelector,
  type IndicatorStyle,
  indicatorStylePropType,
  indicatorStyleSelector,
} from '../themes/colors';
import Search from '../components/search.react';
import Button from '../components/button.react';

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
  | {| type: 'search', searchText: string |}
  | {| type: 'empty', emptyItem: React.ComponentType<{||}> |};

type RouteNames = 'HomeChatThreadList' | 'BackgroundChatThreadList';
type Props = {|
  navigation: ChatTopTabsNavigationProp<RouteNames>,
  route: NavigationRoute<RouteNames>,
  filterThreads: (threadItem: ThreadInfo) => boolean,
  emptyItem?: React.ComponentType<{||}>,
  // Redux state
  chatListData: $ReadOnlyArray<ChatThreadItem>,
  viewerID: ?string,
  threadSearchIndex: SearchIndex,
  styles: typeof styles,
  indicatorStyle: IndicatorStyle,
|};
type State = {|
  searchText: string,
  searchResults: Set<string>,
  openedSwipeableId: string,
|};
type PropsAndState = {| ...Props, ...State |};
class ChatThreadList extends React.PureComponent<Props, State> {
  static propTypes = {
    navigation: PropTypes.shape({
      navigate: PropTypes.func.isRequired,
      dangerouslyGetParent: PropTypes.func.isRequired,
      isFocused: PropTypes.func.isRequired,
    }).isRequired,
    filterThreads: PropTypes.func.isRequired,
    emptyItem: PropTypes.elementType,
    chatListData: PropTypes.arrayOf(chatThreadItemPropType).isRequired,
    viewerID: PropTypes.string,
    threadSearchIndex: PropTypes.instanceOf(SearchIndex).isRequired,
    styles: PropTypes.objectOf(PropTypes.object).isRequired,
    indicatorStyle: indicatorStylePropType.isRequired,
  };
  state = {
    searchText: '',
    searchResults: new Set(),
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
        onSwipeableWillOpen={this.onSwipeableWillOpen}
        currentlyOpenedSwipeableId={this.state.openedSwipeableId}
      />
    );
  };

  searchInputRef = (searchInput: ?React.ElementRef<typeof TextInput>) => {
    this.searchInput = searchInput;
  };

  static keyExtractor(item: Item) {
    if (item.threadInfo) {
      return item.threadInfo.id;
    } else if (item.emptyItem) {
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
    (propsAndState: PropsAndState) => propsAndState.searchResults,
    (propsAndState: PropsAndState) => propsAndState.emptyItem,
    (
      reduxChatListData: $ReadOnlyArray<ChatThreadItem>,
      searchText: string,
      searchResults: Set<string>,
      emptyItem?: React.ComponentType<{||}>,
    ): Item[] => {
      const chatItems = [];
      if (!searchText) {
        chatItems.push(
          ...reduxChatListData.filter(item =>
            this.props.filterThreads(item.threadInfo),
          ),
        );
      } else {
        chatItems.push(
          ...reduxChatListData.filter(item =>
            searchResults.has(item.threadInfo.id),
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
        <Button
          onPress={() =>
            this.props.navigation.navigate({
              name: MessageListRouteName,
              params: {
                threadInfo: {
                  id: 'pending/118852',
                  type: threadTypes.PERSONAL,
                  name: 'Pending thread',
                  uiName: 'Pending thread ui name',
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
                  id: '118852',
                  username: 'Username',
                },
              },
              key: `${MessageListRouteName}/pending/118852`,
            })
          }
        >
          <Text>Pending thread</Text>
        </Button>
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

  onChangeSearchText = (searchText: string) => {
    const results = this.props.threadSearchIndex.getSearchResults(searchText);
    this.setState({ searchText, searchResults: new Set(results) });
  };

  onPressItem = (threadInfo: ThreadInfo) => {
    this.onChangeSearchText('');
    if (this.searchInput) {
      this.searchInput.blur();
    }
    this.props.navigation.navigate({
      name: MessageListRouteName,
      params: { threadInfo },
      key: `${MessageListRouteName}${threadInfo.id}`,
    });
  };

  onSwipeableWillOpen = (threadInfo: ThreadInfo) => {
    this.setState(state => ({ ...state, openedSwipeableId: threadInfo.id }));
  };

  composeThread = () => {
    this.props.navigation.navigate({
      name: ComposeThreadRouteName,
      params: {},
    });
  };
}

const styles = {
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
const stylesSelector = styleSelector(styles);

export default connect((state: AppState) => ({
  chatListData: chatListDataWithNestedSidebars(state),
  viewerID: state.currentUserInfo && state.currentUserInfo.id,
  threadSearchIndex: threadSearchIndex(state),
  styles: stylesSelector(state),
  indicatorStyle: indicatorStyleSelector(state),
}))(ChatThreadList);

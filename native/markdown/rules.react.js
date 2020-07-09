// @flow

import type { StyleSheetOf } from '../themes/colors';
import type { MarkdownStyles } from './styles';

import * as React from 'react';
import { Text, Linking } from 'react-native';
import * as SimpleMarkdown from 'simple-markdown';

export default function rules(styles: StyleSheetOf<MarkdownStyles>) {
  return {
    // Matches '<https://google.com>' during parse phase and returns a 'link'
    // node
    autolink: SimpleMarkdown.defaultRules.autolink,
    // Matches 'https://google.com' during parse phase and returns a 'link' node
    url: {
      ...SimpleMarkdown.defaultRules.url,
      // simple-markdown is case-sensitive, but we don't want to be
      match: SimpleMarkdown.inlineRegex(
        /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/i,
      ),
    },
    // Matches '[Google](https://google.com)' during parse phase and handles
    // rendering all 'link' nodes, including for 'autolink' and 'url'
    link: {
      ...SimpleMarkdown.defaultRules.link,
      react(
        node: SimpleMarkdown.SingleASTNode,
        output: SimpleMarkdown.Output<SimpleMarkdown.ReactElement>,
        state: SimpleMarkdown.State,
      ) {
        const onPressLink = () => {
          Linking.openURL(node.target);
        };
        return (
          <Text key={state.key} style={styles.link} onPress={onPressLink}>
            {output(node.content, state)}
          </Text>
        );
      },
    },
    // Each line gets parsed into a 'paragraph' node. The AST returned by the
    // parser will be an array of one or more 'paragraph' nodes
    paragraph: {
      ...SimpleMarkdown.defaultRules.paragraph,
      // simple-markdown collapses multiple newlines into one, but we want to
      // preserve the newlines
      match: SimpleMarkdown.anyScopeRegex(/^((?:[^\n]|\n(?! *\n))+)(?:\n *)\n/),
      // eslint-disable-next-line react/display-name
      react: (
        node: SimpleMarkdown.SingleASTNode,
        output: SimpleMarkdown.Output<SimpleMarkdown.ReactElement>,
        state: SimpleMarkdown.State,
      ) => (
        <Text key={state.key} style={styles.paragraph}>
          {output(node.content, state)}
        </Text>
      ),
    },
    // This is the leaf node in the AST returned by the parse phase. We handle
    // rendering emoji as a different size here
    text: {
      ...SimpleMarkdown.defaultRules.text,
      react(
        node: SimpleMarkdown.SingleASTNode,
        output: SimpleMarkdown.Output<string>,
        state: SimpleMarkdown.State,
      ) {
        if (state.emojiOnly) {
          return (
            <Text key={state.key} style={styles.emojiOnlyText}>
              {node.content}
            </Text>
          );
        }
        return <React.Fragment key={state.key}>{node.content}</React.Fragment>;
      },
    },
  };
}

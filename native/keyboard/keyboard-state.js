// @flow

import * as React from 'react';
import PropTypes from 'prop-types';

export type KeyboardState = {|
  keyboardShowing: boolean,
  dismissKeyboard: () => void,
  dismissKeyboardIfShowing: () => boolean,
  systemKeyboardShowing: boolean,
  mediaGalleryOpen: boolean,
  showMediaGallery: (threadID: string) => void,
  hideMediaGallery: () => void,
  getMediaGalleryThreadID: () => ?string,
|};

const keyboardStatePropType = PropTypes.shape({
  keyboardShowing: PropTypes.bool.isRequired,
  dismissKeyboard: PropTypes.func.isRequired,
  dismissKeyboardIfShowing: PropTypes.func.isRequired,
  systemKeyboardShowing: PropTypes.bool.isRequired,
  mediaGalleryOpen: PropTypes.bool.isRequired,
  showMediaGallery: PropTypes.func.isRequired,
  hideMediaGallery: PropTypes.func.isRequired,
  getMediaGalleryThreadID: PropTypes.func.isRequired,
});

const KeyboardContext = React.createContext<?KeyboardState>(null);

export { keyboardStatePropType, KeyboardContext };

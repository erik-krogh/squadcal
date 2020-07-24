// @flow

const urlRegEx = /^(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/i;
const paragraphRegEx = /^((?:[^\n]*)(?:\n|$))/;
const blockQuoteRegEx = /^( *>[^\n]+(?:\n[^\n]+)*)/;
const headingRegEx = /^ *(#{1,6}) ([^\n]+?)#* *(?![^\n])/;
const codeBlockRegEx = /^(?: {4}[^\n]*\n*?)+(?!\n* {4}[^\n])(?:\n|$)/;
const fenceRegEx = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*\n)\0(?:\n|$)/;

export {
  urlRegEx,
  paragraphRegEx,
  blockQuoteRegEx,
  headingRegEx,
  codeBlockRegEx,
  fenceRegEx,
};

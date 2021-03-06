// @flow

import type {
  CodeVerificationRequest,
  HandleVerificationCodeResult,
} from 'lib/types/verify-types';
import type { Viewer } from '../session/viewer';

import t from 'tcomb';

import { ServerError } from 'lib/utils/errors';
import { verifyField } from 'lib/types/verify-types';

import { validateInput, tShape } from '../utils/validation-utils';
import { handleCodeVerificationRequest } from '../models/verification';

const codeVerificationRequestInputValidator = tShape({
  code: t.String,
});

async function codeVerificationResponder(
  viewer: Viewer,
  input: any,
): Promise<HandleVerificationCodeResult> {
  const request: CodeVerificationRequest = input;
  await validateInput(viewer, codeVerificationRequestInputValidator, request);

  const result = await handleCodeVerificationRequest(viewer, request.code);
  if (result.field === verifyField.EMAIL) {
    return { verifyField: result.field };
  } else if (result.field === verifyField.RESET_PASSWORD) {
    return {
      verifyField: result.field,
      resetPasswordUsername: result.username,
    };
  }
  throw new ServerError('invalid_code');
}

export { codeVerificationResponder };

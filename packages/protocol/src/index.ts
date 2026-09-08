/**
 * Wire contract shared by the server and every client.
 *
 * Bumped whenever a message shape changes incompatibly; the server refuses
 * connections from clients on a different major protocol version.
 */
export const PROTOCOL_VERSION = 1

export {
  EMAIL_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  PASSWORD_PATTERN,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_PATTERN,
  checkRegistration,
  emailSchema,
  isCommonPassword,
  isReservedUsername,
  normaliseEmail,
  normaliseUsername,
  passwordSchema,
  registerRequestSchema,
  usernameSchema,
} from './account.js'
export type { RegisterErrorField, RegisterFieldError, RegisterRequest } from './account.js'

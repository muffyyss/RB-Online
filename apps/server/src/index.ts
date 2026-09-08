export { registerUser } from './auth/register.js'
export type { Database, RegisterContext, RegisteredUser, RegisterResult } from './auth/register.js'
export { fakeVerify, hashPassword, verifyPassword } from './auth/password.js'
export {
  CODE_LENGTH,
  generateInviteCode,
  hashInviteCode,
  hashesMatch,
  normaliseInviteCode,
} from './auth/invite.js'
export {
  CREATE_TABLES,
  auditLog,
  inviteCodes,
  inviteRedemptions,
  userCredentials,
  users,
} from './db/schema.js'
export type { UserRole, UserStatus } from './db/schema.js'

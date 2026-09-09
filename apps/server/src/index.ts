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

export { buildApp } from './app.js'
export type { AppOptions } from './app.js'
export { loadConfig } from './config.js'
export type { Config } from './config.js'
export { connect } from './db/client.js'
export type { Connection } from './db/client.js'
export {
  createInvite,
  listInvites,
  listUsers,
  revokeInvite,
  setUserRole,
  setUserStatus,
} from './admin/index.js'
export type {
  CreatedInvite,
  CreateInviteOptions,
  InviteSummary,
  UserSummary,
} from './admin/index.js'

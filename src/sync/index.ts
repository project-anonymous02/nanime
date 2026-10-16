export { readConfig, isConfigured, getClient, currentConfig, resetClient } from './client';
export type { SupabaseConfig } from './client';

export {
  initAuth,
  disposeAuth,
  currentAuth,
  currentUserId,
  onAuthChange,
  signInGoogle,
  signInEmail,
  signOut,
  exchangeCode,
  isNative,
  humanAuthError
} from './auth';
export type { AuthState, SignInResult } from './auth';

export { startSync, stopSync, flush, forceSync, syncStatus, onSyncStatus, markAllAndFlush } from './engine';
export type { SyncStatus } from './types';

export { Queue } from './queue';

export { migrateGuestToAccount, scheduleImportSync, deleteAllAccountData } from './migrate';
export type { MigrationResult } from './migrate';

export { snapshotLocal, mergeRemote, applyMergeToStore } from './repository';

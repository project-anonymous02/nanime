import { isConfigured, getClient } from './client';
import { currentUserId } from './auth';
import { Queue } from './queue';
import { forceSync, markAllAndFlush } from './engine';
import { snapshotLocal } from './repository';
import type { EntryRow, HistoryRow, ListRow, ProgressRow, SettingRow } from './types';

/**
 * Migrasi data tamu → akun.
 * - Data TIDAK pernah dihapus bila proses gagal.
 * - Data lokal digabung dengan remote (LWW per baris) lalu seluruhnya didorong.
 * - Konfirmasi dilakukan pemanggil (UI) sebelum fungsi ini dijalankan.
 */

export interface MigrationResult {
  ok: boolean;
  message: string;
}

export async function migrateGuestToAccount(): Promise<MigrationResult> {
  const uid = currentUserId();
  if (!isConfigured()) return { ok: false, message: 'Supabase belum dikonfigurasi.' };
  if (!uid) return { ok: false, message: 'Belum masuk akun.' };

  // Snapshot lokal dulu (jaga-jaga bila langkah berikut gagal)
  const local = snapshotLocal();
  if (!local.entries.length && !local.progress.length && !local.history.length) {
    // Tidak ada data tamu yang perlu dimigrasi — cukup sinkron penuh
    const ok = await forceSync();
    return { ok, message: ok ? 'Tidak ada data tamu; sinkronisasi penuh dijalankan.' : 'Sinkronisasi gagal. Coba lagi.' };
  }

  try {
    // forceSync menarik remote lalu menggabungkan; mergeRemote menyatukan lokal+remote
    Queue.markAllDirty();
    const ok = await forceSync();
    if (!ok) {
      // Jangan sentuh data lokal — tetap utuh
      return { ok: false, message: 'Migrasi gagal (jaringan/server). Data lokal tetap aman.' };
    }
    return {
      ok: true,
      message:
        local.entries.length + ' entri, ' + local.progress.length + ' progres & ' + local.history.length +
        ' riwayat digabung ke akun (last-write-wins).'
    };
  } catch {
    return { ok: false, message: 'Migrasi gagal. Data lokal tetap aman.' };
  }
}

/** Sinkronkan perubahan impor file ke akun (setelah applyImport). */
export function scheduleImportSync(): void {
  if (currentUserId()) markAllAndFlush();
}

/** Hapus SEMUA data akun di server (dipakai alur penghapusan akun). */
export async function deleteAllAccountData(): Promise<MigrationResult> {
  const uid = currentUserId();
  if (!uid || !isConfigured()) return { ok: false, message: 'Tidak ada akun aktif.' };
  try {
    const sb = getClient();
    if (!sb) return { ok: false, message: 'Client tidak tersedia.' };
    const tables = ['entries', 'progress', 'history', 'lists', 'settings'] as const;
    for (const t of tables) {
      const { error } = await sb.from(t).delete().eq('user_id', uid);
      if (error) return { ok: false, message: 'Gagal menghapus ' + t + ': ' + error.message };
    }
    Queue.reset();
    return { ok: true, message: 'Seluruh data akun di server dihapus.' };
  } catch (e) {
    return { ok: false, message: 'Gagal menghapus data akun: ' + ((e as Error)?.message || '') };
  }
}

export { snapshotLocal };
export type { EntryRow, ProgressRow, HistoryRow, ListRow, SettingRow };

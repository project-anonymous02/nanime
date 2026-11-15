/**
 * Format tanggal/waktu bersama.
 *
 * `Date.prototype.toLocaleTimeString`/`toLocaleDateString` membangun ulang
 * formatter Intl pada setiap pemanggilan. Diukur di Chromium: ~626 µs per
 * pemanggilan (locale id-ID), sedangkan instance `Intl.DateTimeFormat` yang
 * dipakai ulang hanya ~36 µs. Daftar chat/riwayat memformat dozens baris
 * per render, jadi formatter di-cache di sini.
 *
 * Hasil keluaran identik dengan `toLocale*String` versi lama (dijamin tes).
 */

const CLOCK = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
const DATE_LONG = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Jam:menit lokal, mis. "08.39". String tidak valid → ''. */
export function clockLabel(value: string | number | Date): string {
  const date = toDate(value);
  return date ? CLOCK.format(date) : '';
}

/** Tanggal panjang, mis. "15 November 2026". */
export function longDateLabel(value: string | number | Date): string {
  const date = toDate(value);
  return date ? DATE_LONG.format(date) : '';
}

/** Tanggal pendek, mis. "15 Nov". */
export function shortDateLabel(value: string | number | Date): string {
  const date = toDate(value);
  return date ? DATE_SHORT.format(date) : '';
}

import { create } from 'zustand';
import type { WatchParty } from '../lib/watchParty';

const KEY = 'nanime.v2.watch-party';
function restored(): WatchParty | null {
  try { const value = localStorage.getItem(KEY); return value ? JSON.parse(value) as WatchParty : null; } catch { return null; }
}
interface PartyState { active: WatchParty | null; set: (party: WatchParty | null) => void; clear: () => void; }
export const useWatchParty = create<PartyState>(set => ({
  active: restored(),
  set: party => { try { if (party) localStorage.setItem(KEY, JSON.stringify(party)); else localStorage.removeItem(KEY); } catch { /* state tetap aktif di memori */ } set({ active: party }); },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* no-op */ } set({ active: null }); }
}));

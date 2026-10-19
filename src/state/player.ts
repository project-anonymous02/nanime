import { create } from 'zustand';
import type { SyntheticEvent } from 'react';
import type { StreamBundle } from '../core/types';

export interface PlayerSession {
  request: number;
  animeId: string;
  title: string;
  poster: string;
  synopsis?: string;
  episode: string;
  stream: StreamBundle | null;
  loading: boolean;
  error: string;
  sourceIndex: number;
  onPrevious?: () => void;
  onNext?: () => void;
  retry: () => void;
  onProgress: (event: SyntheticEvent<HTMLVideoElement>) => void;
}

interface PlayerState {
  session: PlayerSession | null;
  mode: 'full' | 'mini';
  start: (session: Omit<PlayerSession, 'request' | 'stream' | 'loading' | 'error' | 'sourceIndex'>) => number;
  update: (request: number, patch: Partial<PlayerSession>) => void;
  setMode: (mode: 'full' | 'mini') => void;
  close: () => void;
}

let requestSequence = 0;

export const usePlayer = create<PlayerState>(set => ({
  session: null,
  mode: 'full',
  start: session => {
    const request = ++requestSequence;
    set({ session: { ...session, request, stream: null, loading: true, error: '', sourceIndex: 0 }, mode: 'full' });
    return request;
  },
  update: (request, patch) => set(state => state.session?.request === request
    ? { session: { ...state.session, ...patch } }
    : state),
  setMode: mode => set({ mode }),
  close: () => {
    requestSequence++;
    set({ session: null, mode: 'full' });
  }
}));

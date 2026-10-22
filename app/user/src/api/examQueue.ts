import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { onConnectivityChange } from './connectivity';
import { ApiError, normalizeError } from './errors';
import { autosaveExam, submitExam } from './exams';
import type { ExamAutosaveBody, ExamSubmitBody } from './types';

/**
 * Offline-tolerant exam sync (EXM-05 / EXM-07).
 * Every change writes the full attempt state to AsyncStorage with a monotonic `seq` (epoch ms), then tries
 * to upload. Failures stay queued and are flushed on reconnect / app foreground. The server ignores
 * payloads whose `seq` is not newer, so replays are safe. A pending submit is kept and retried the same way.
 */
const KEY = 'eduway.examQueue.v1';

interface QueueEntry {
  save?: ExamAutosaveBody;
  submit?: ExamSubmitBody;
  savedSeq?: number;
}
type Queue = Record<string, QueueEntry>;

let queue: Queue = {};
let loaded: Promise<void> | null = null;
let flushing: Promise<void> | null = null;
let lastSeq = 0;

export type SyncState = 'saved' | 'saving' | 'queued';
type Listener = (attemptId: string, state: SyncState) => void;
const listeners = new Set<Listener>();
export function onExamSync(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const notify = (id: string, s: SyncState) => listeners.forEach((l) => l(id, s));

function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((raw) => {
        queue = raw ? (JSON.parse(raw) as Queue) : {};
      })
      .catch(() => {
        queue = {};
      });
  }
  return loaded;
}

const persist = () => AsyncStorage.setItem(KEY, JSON.stringify(queue)).catch(() => {});

/** Monotonic sequence number (survives restarts because it is time based). */
export function nextSeq(): number {
  lastSeq = Math.max(lastSeq + 1, Date.now());
  return lastSeq;
}

/** Final states that make further syncing pointless. */
const isTerminal = (e: ApiError) =>
  e.reason === 'EXAM_ALREADY_SUBMITTED' || e.reason === 'EXAM_TIME_OVER' || e.code === 'NOT_FOUND' || e.status === 409;

async function flushOne(attemptId: string): Promise<void> {
  const entry = queue[attemptId];
  if (!entry) return;
  if (entry.save && entry.save.seq !== entry.savedSeq) {
    const body = entry.save;
    notify(attemptId, 'saving');
    try {
      await autosaveExam(attemptId, body);
      entry.savedSeq = body.seq;
    } catch (err) {
      const e = normalizeError(err);
      if (!isTerminal(e)) {
        notify(attemptId, 'queued');
        throw e;
      }
      entry.save = undefined;
    }
  }
  if (entry.submit) {
    try {
      await submitExam(attemptId, entry.submit);
    } catch (err) {
      const e = normalizeError(err);
      if (!isTerminal(e)) {
        notify(attemptId, 'queued');
        throw e;
      }
    }
    delete queue[attemptId];
    await persist();
    notify(attemptId, 'saved');
    return;
  }
  await persist();
  notify(attemptId, 'saved');
}

/** Upload everything that is queued. Safe to call any time. */
export function flushExamQueue(): Promise<void> {
  if (!flushing) {
    flushing = (async () => {
      await load();
      for (const id of Object.keys(queue)) {
        try {
          await flushOne(id);
        } catch {
          // still offline — keep the rest queued
          break;
        }
      }
    })().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

/** Persist the latest full state and try to upload it. Resolves to the resulting sync state. */
export async function queueAutosave(attemptId: string, state: Omit<ExamAutosaveBody, 'seq' | 'clientSavedAt'>): Promise<SyncState> {
  await load();
  const body: ExamAutosaveBody = { ...state, seq: nextSeq(), clientSavedAt: new Date().toISOString() };
  queue[attemptId] = { ...queue[attemptId], save: body };
  await persist();
  try {
    await flushOne(attemptId);
    return 'saved';
  } catch {
    return 'queued';
  }
}

/**
 * Submit with a final flush of the answers. When offline the submit is queued and retried on reconnect;
 * returns `true` when the server accepted it now.
 */
export async function queueSubmit(attemptId: string, body: ExamSubmitBody): Promise<boolean> {
  await load();
  const final: ExamSubmitBody = { ...body, seq: body.seq ?? nextSeq() };
  queue[attemptId] = { ...queue[attemptId], submit: final };
  await persist();
  try {
    await flushOne(attemptId);
    return true;
  } catch (err) {
    const e = normalizeError(err);
    if (e.isNetwork) return false;
    throw e;
  }
}

/** Locally saved (possibly un-uploaded) state for an attempt, used to resume after a restart offline. */
export async function getLocalExamState(attemptId: string): Promise<ExamAutosaveBody | null> {
  await load();
  return queue[attemptId]?.save ?? null;
}

export async function hasPendingSubmit(attemptId: string): Promise<boolean> {
  await load();
  return !!queue[attemptId]?.submit;
}

export async function clearExamState(attemptId: string): Promise<void> {
  await load();
  delete queue[attemptId];
  await persist();
}

// Flush when connectivity returns or the app comes to the foreground.
onConnectivityChange((online) => {
  if (online) void flushExamQueue();
});
AppState.addEventListener('change', (s) => {
  if (s === 'active') void flushExamQueue();
});

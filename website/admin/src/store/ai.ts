import { create } from 'zustand';
import { defaultAiSettings, flaggedConversations } from '@/data/ai';
import type { AiSettings } from '@/types';
import { diff, logAudit } from './audit';
import { createCollection } from './createCollection';

interface AiSettingsState {
  settings: AiSettings;
  update: (patch: Partial<AiSettings>, meta?: { action?: string; summary?: string }) => void;
}

export const useAiSettings = create<AiSettingsState>()((set, get) => ({
  settings: defaultAiSettings,
  update: (patch, meta) => {
    const prev = get().settings;
    const d = diff(prev, patch);
    if (!d.changed) return;
    set({ settings: { ...prev, ...patch } });
    logAudit({
      action: meta?.action ?? 'ai_settings.update',
      entity: 'ai_settings',
      entityId: 'global',
      summary: meta?.summary ?? `Updated AI Tutor settings (${Object.keys(d.after).join(', ')})`,
      before: d.before,
      after: d.after,
    });
  },
}));

export const useFlaggedConversations = createCollection('ai_flag', flaggedConversations, (f) => f.id);

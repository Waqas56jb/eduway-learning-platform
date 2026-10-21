import { useContext } from 'react';
import { LangContext } from '@/context/LangContext';

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside <LangProvider>');
  return ctx;
}

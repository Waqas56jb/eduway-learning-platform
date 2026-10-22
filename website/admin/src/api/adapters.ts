/* Small DTO ⇄ UI mapping helpers shared by the F2 domain modules (packages, payments, partners, ai, analytics,
 * notifications, settings, security). The API speaks `Localized` ({ en, ar }); the admin UI keeps flat
 * `<field>_en` / `<field>_ar` pairs (contract §0.7). */
import type { Localized } from './types';

/** `{ en, ar }` → `{ [field_en], [field_ar] }`. */
export function flatLoc<F extends string>(field: F, l: Localized | null | undefined): Record<`${F}_en` | `${F}_ar`, string> {
  return { [`${field}_en`]: l?.en ?? '', [`${field}_ar`]: l?.ar ?? '' } as Record<`${F}_en` | `${F}_ar`, string>;
}

/** Flat UI object → `Localized` for request bodies. */
export function toLoc(obj: object, field: string): Localized {
  const rec = obj as Record<string, unknown>;
  return { en: String(rec[`${field}_en`] ?? ''), ar: String(rec[`${field}_ar`] ?? '') };
}

/** Localized ref (`{ id, name }`) → flat (`{ id, name, name_en, name_ar }`) so `useLocalize()(x, 'name')` works. */
export function flatRef<T extends { name: Localized }>(ref: T): T & { name_en: string; name_ar: string };
export function flatRef<T extends { name: Localized }>(ref: T | null | undefined): (T & { name_en: string; name_ar: string }) | null;
export function flatRef<T extends { name: Localized }>(ref: T | null | undefined) {
  if (!ref) return null;
  return { ...ref, name_en: ref.name?.en ?? '', name_ar: ref.name?.ar ?? '' };
}

/** English display string of a Localized (for searchText / CSV fallbacks). */
export const en = (l: Localized | null | undefined) => l?.en ?? '';

/** Both languages joined (for client-side search fallbacks). */
export const both = (l: Localized | null | undefined) => (l ? `${l.en} ${l.ar}` : '');

/** Drop keys whose value is `undefined` (PATCH bodies). */
export function compact<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

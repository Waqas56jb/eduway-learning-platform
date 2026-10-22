export { LegalDocument, type LegalDocKey, type LegalDocumentProps } from './LegalDocument';

export const TERMS_SECTIONS = ['accounts', 'subscriptions', 'devices', 'content', 'ai', 'termination', 'law'] as const;
export const PRIVACY_SECTIONS = ['collected', 'use', 'storage', 'minors', 'rights', 'contact'] as const;
export const LEGAL_UPDATED_AT = '2026-09-01T00:00:00Z';

import { useLegalDoc } from '@/api';
import { LEGAL_UPDATED_AT, LegalDocument, TERMS_SECTIONS } from '@/components/legal';

/** GET /legal/terms (current published version); the bundled copy renders until it arrives or when offline. */
export default function TermsScreen() {
  const { data } = useLegalDoc('terms');
  return (
    <LegalDocument
      doc="terms"
      sections={TERMS_SECTIONS}
      updatedAt={LEGAL_UPDATED_AT}
      icon="note"
      contactEmail="support@eduway.iq"
      remote={data}
    />
  );
}

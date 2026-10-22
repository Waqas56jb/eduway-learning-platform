import { useLegalDoc } from '@/api';
import { LEGAL_UPDATED_AT, LegalDocument, PRIVACY_SECTIONS } from '@/components/legal';

/** GET /legal/privacy (current published version); the bundled copy renders until it arrives or when offline. */
export default function PrivacyScreen() {
  const { data } = useLegalDoc('privacy');
  return (
    <LegalDocument
      doc="privacy"
      sections={PRIVACY_SECTIONS}
      updatedAt={LEGAL_UPDATED_AT}
      icon="shield"
      contactEmail="privacy@eduway.iq"
      remote={data}
    />
  );
}

import { SavedJourneysDock } from "@/components/saved-journeys-dock";
import { TrustAppIngestion } from "@/components/trust-app-ingestion";

export default function HomePage() {
  return (
    <>
      <TrustAppIngestion />
      <SavedJourneysDock />
    </>
  );
}

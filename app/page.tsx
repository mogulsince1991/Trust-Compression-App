import { AuthFirstApp } from "@/components/auth-first-app";
import { SavedJourneysDock } from "@/components/saved-journeys-dock";

export default function HomePage() {
  return (
    <>
      <AuthFirstApp />
      <SavedJourneysDock />
    </>
  );
}

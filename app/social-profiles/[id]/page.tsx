import { AuthFirstApp } from "@/components/auth-first-app";
import { SavedJourneysDock } from "@/components/saved-journeys-dock";

export default function SocialProfileReportRoute({ params }: { params: { id: string } }) {
  return (
    <>
      <AuthFirstApp initialView="socialProfiles" initialSocialProfileReportId={params.id} />
      <SavedJourneysDock />
    </>
  );
}

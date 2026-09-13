import { redirect } from "next/navigation";

export default function SocialProfileReportRoute({ params }: { params: { id: string } }) {
  redirect(`/app/settings/youtube/${encodeURIComponent(params.id)}`);
}

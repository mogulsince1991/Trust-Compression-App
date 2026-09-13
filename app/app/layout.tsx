import { AuthFirstApp } from "@/components/auth-first-app";
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <><AuthFirstApp initialView="home" />{children}</>;
}

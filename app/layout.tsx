import type { Metadata } from "next";
import "./globals.css";
import "./journeys.css";
import "./configurator.css";
import "./source-expansion.css";
import "./product-overrides.css";
import "./final-polish.css";
import "./journey-mobile-fix.css";
import "./sage.css";
import "./journey-experience.css";

export const metadata: Metadata = {
  title: "TrustTale",
  description: "Bring together the proof that helps buyers choose you."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

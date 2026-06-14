import type { Metadata } from "next";
import "./globals.css";
import "./journeys.css";
import "./configurator.css";
import "./source-expansion.css";
import "./product-overrides.css";

export const metadata: Metadata = {
  title: "Trust Library",
  description: "Turn existing video assets into searchable trust journeys."
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

import type { Metadata } from "next";
import "./globals.css";

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

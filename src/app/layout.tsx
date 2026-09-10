/**
 * Root layout.
 *
 * Holds the font and the page shell. IBM Plex Mono is the only typeface in the app - justified
 * by the subject (a coding interview), not used as decoration - so it carries every weight of
 * hierarchy from here down. See docs/ARCHITECTURE.md §3 for how the page grows in later phases.
 */

import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Interview Loop",
  description: "Mock technical interviews that will not let you quit on a problem.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

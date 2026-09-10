/**
 * /session - the Phase 1 interview route (docs/ARCHITECTURE.md §3).
 *
 * A server-component shell around the interactive InterviewSession client component, kept
 * separate so this file can still export page metadata.
 */

import type { Metadata } from "next";

import { InterviewSession } from "./InterviewSession";

export const metadata: Metadata = {
  title: "Session — Interview Loop",
};

export default function SessionPage() {
  return <InterviewSession />;
}

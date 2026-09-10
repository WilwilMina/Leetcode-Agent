/**
 * POST /api/turn - one interviewer reply.
 *
 * Node runtime (the Anthropic SDK needs it). Rate-limited per `.claude/rules/security.md`: "a
 * candidate can't run up spend by holding the mic open." Stateless: the client sends the full
 * conversation history each call (docs/ARCHITECTURE.md §5); nothing is kept server-side between
 * requests.
 */

import { NextResponse } from "next/server";

import { checkAndRecord, getRateLimitKey } from "@/lib/auth/rateLimit";
import { getInterviewerReply } from "@/lib/llm/turn";
import { TurnRequestSchema } from "@/lib/schemas/turnRequest";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const decision = checkAndRecord(getRateLimitKey(request));

  if (decision.kind === "deny") {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }

  const parsed = TurnRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await getInterviewerReply(parsed.data.history);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[turn]", error);
    return NextResponse.json({ error: "Interviewer request failed" }, { status: 502 });
  }
}

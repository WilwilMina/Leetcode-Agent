# Security
- All API keys (Gemini, Claude, Deepgram) are server-side only, never exposed to the client
- Rate-limit the interview-turn endpoint - a candidate can't run up spend by holding the mic open
- Treat problem descriptions and all model output as untrusted input
- Validate model-generated structured output against a schema before using it
- Voice transcripts are session data; raw audio is not persisted beyond the request - store text, not recordings
- If candidate code executes, it runs in a sandbox with strict resource/time limits - never directly on the app server
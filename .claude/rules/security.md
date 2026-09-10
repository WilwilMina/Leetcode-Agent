# Security
- Model API keys: server-side only, never exposed to the client
- Treat problem descriptions and all model output as untrusted input
- Validate model-generated structured output against a schema before using it
- If candidate code executes, it runs in a sandbox with strict resource/time limits - never
  directly on the app server

---
name: Gemini model availability
description: Direct Google GenAI model availability and output-token behavior observed with this project's key.
---

For this app's direct Gemini API-key flow, do not default to Gemini 2.5 Flash: a live request reported it unavailable to new users and recommended Gemini 3.8 Flash. Gemini 3.8 Flash spends from the same `maxOutputTokens` cap on reasoning and visible answer text; with this app's 300-token default it returned a short, cut-off answer. Gemini 3.5 Flash-Lite was available and produced a complete short reply quickly, so it is the current default. `GEMINI_MODEL` can override it.

**Why:** A user-enabled API key rejected the older model, and live generation showed that the recommended reasoning model can consume the visitor's answer budget.

**How to apply:** Before changing the default, verify the model with the configured API key and check both a normal question and a low `maxOutputTokens` request.

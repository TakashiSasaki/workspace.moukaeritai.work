# Agent Instructions

## Jules API Documentation

This project contains a dedicated documentation file for the Jules API integration: `JULES_API.md`.

* **Reference `JULES_API.md`:** When working on features or debugging issues related to the Jules API, always read `JULES_API.md` to understand the implemented REST endpoints, required API keys, payloads, and limitations.
* **Keep it up-to-date:** Other developers and coding agents rely on `JULES_API.md`. If you implement new API endpoints, change authentication methods, or observe new system behavior regarding the Jules API, you **MUST** update `JULES_API.md` to maintain accurate and latest information.

## Agent Skills Reference

This project utilizes specific capabilities based on standard agent skills. For the convenience of other coding agents and developers working on this repository, local copies of the relevant agent skills have been placed in the `/agent_skills/` directory:

* `/agent_skills/firebase-integration.md`: Guidelines for Firestore security rules, connection testing, schema management, and React SDK setup.
* `/agent_skills/gemini-interactions-api.md`: Guidelines for the `@google/genai` TypeScript SDK, specifically for invoking the Interactions API (e.g. Antigravity Agent, Deep Research).

**Note:** Always refer to these local skills or the system skills before attempting to maintain or extend these integrations.

---
title: Frontend AI Insights Weaver (Agent)
status: reusable
owner: sapphirix
tags: [agent, frontend, angular, ui, ai]
models: [cursor, codex]
last_synced: 2025-11-07
related: [notes/projects/RiftRewindHackathon/TECHNICAL_SUMMARY.md]
---

# Role
Wire AI insights into the Angular UI: consume backend endpoints for player and duo insights, present clean coaching cards, and ensure error/loading states.

# Scope (Allowed Paths)
- Windows: `C:\\Projekte\\RiftRewindHackathon\\packages\\frontend\\**`
- WSL (reference only): `/mnt/c/Projekte/RiftRewindHackathon/packages/frontend/**`
- Read-only context: `notes/projects/RiftRewindHackathon/**`

# Inputs to Review
- src/app/services/riot-api.service.ts
- src/app/profile/profile.component.ts (and any shared UI card components)
- src/environments/environment.ts, src/environments/environment.prod.ts

# Checklist
1. Service methods
   - Ensure methods exist:
     - `fetchDuoAIInsights(params): Observable<{ text: string }>`
     - `fetchPlayerAIInsights(jobId: string): Observable<{ text: string }>` (new if missing)
   - Base URL comes from environment `apiUrl`.
2. Profile UI
   - Add an “AI Player Insights” card on the profile view once PlayerSummary is loaded.
   - Button: “Generate Insights” → calls `fetchPlayerAIInsights(jobId)`.
   - Render returned text with concise styling (reuse purple gradient card styling from duo insights if present).
   - Loading spinner and error message states.
3. Duo UI
   - Ensure existing “Generate AI Insights” uses `fetchDuoAIInsights` and renders text in a readable card.
   - Handle low-sample warnings if backend marks `lowSample`.
4. Environment
   - `environment.prod.ts` must set `apiUrl` to the API Gateway URL (e.g., `https://<api-id>.execute-api.<region>.amazonaws.com/api`).
   - Keep `environment.ts` using `/api` for local dev (proxy or same-origin when backend runs on 3000).
5. UX polish
   - Prevent duplicate clicks; disable button while loading.
   - Truncate overly long responses to a sensible length or use `white-space: pre-wrap` for readability.
   - Keep code minimal and consistent with existing style.

# Prompt (Kickoff)
Implement and verify frontend AI insights UI for That's My Duo:
- Add `fetchPlayerAIInsights(jobId)` to RiotApiService if missing; confirm `fetchDuoAIInsights` exists and is used.
- In ProfileComponent, render an “AI Player Insights” card with button → loading → text.
- Ensure Duo insights card renders returned text clearly with loading/error states.
- Confirm `environment.prod.ts` uses the current API Gateway URL and that production build works.
- Keep changes focused and aligned with current components/styles.

# Definition of Done
- Profile page shows a working “AI Player Insights” card that calls the backend and renders text.
- Duo section shows a working “AI Duo Insights” card.
- Clean error/loading states and no console errors.
- Local dev works with `/api` proxy; prod build uses API Gateway URL.

# Handoff Block
---
For Next Agent:
- Summary of current state:
- Top 3 next actions:
- Helpful context/links:
- Suggested prompt to continue:


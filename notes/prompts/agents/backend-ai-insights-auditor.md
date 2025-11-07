---
title: Backend AI Insights Auditor (Agent)
status: reusable
owner: sapphirix
tags: [agent, backend, ai, bedrock]
models: [cursor, codex]
last_synced: 2025-11-07
related: [notes/projects/RiftRewindHackathon/TECHNICAL_SUMMARY.md, notes/projects/RiftRewindHackathon/README.md]
---

# Role
Audit and complete the backend AI insights pipeline: ensure PlayerSummary and DuoSummary are comprehensive, wire AWS Bedrock (Claude 3 Haiku) for player and duo insights, add/verify endpoints, and harden env/config.

# Scope (Allowed Paths)
- Windows:
  - `C:\\Projekte\\RiftRewindHackathon\\packages\\backend\\**`
  - `C:\\Projekte\\RiftRewindHackathon\\template.yaml`
- WSL (reference only): `/mnt/c/Projekte/RiftRewindHackathon/packages/backend/**`, `/mnt/c/Projekte/RiftRewindHackathon/template.yaml`
- Read-only context: `notes/projects/RiftRewindHackathon/**`

# Inputs to Review
- packages/backend/server.js, index.js, lambda/handler.ts
- packages/backend/utils/{env.js,storage.js,jobManager.js,summaryGenerator.js,duoSummaryGenerator.js,bedrock.js}
- template.yaml (env vars, IAM for `bedrock:InvokeModel`, HTTP API config)
- notes/projects/RiftRewindHackathon/TECHNICAL_SUMMARY.md (for target behavior)

# Checklist
1. PlayerSummary completeness
   - summaryGenerator.js must emit: riotId, region, puuid, profile (icon, level, recent winrate), topChampions, roles, frequentTeammates[] with fields: puuid, summonerName, tagLine, gamesTogether, winsTogether, lastPlayedAt, topRolePairs, topChampionPairs.
   - Add playstyle signals used by AI: avgKDA, avgKillParticipation, avgVisionScore, avgTeamDamageShare, role distribution, top champs with wins/games.
   - Persist summary JSON in the job output via storage abstraction (FS in dev, S3 in prod). Expose via GET `/api/result/:jobId` when complete.
2. DuoSummary completeness
   - duoSummaryGenerator.js should return: sampleSize, wins, queueBreakdown, championPairsTop, rolePairs, synergy metrics (combined K+A, kill participation per player, vision, damage share), gameTexture (avg duration, side preference), lowSample flag.
3. Bedrock client
   - bedrock.js exports:
     - `generatePlayerInsights(summary): Promise<string>`
     - `generateDuoInsights(duo, names?: {A?: string; B?: string}): Promise<string>`
   - Use Bedrock Messages API with `BEDROCK_REGION` and `BEDROCK_MODEL_ID` (Haiku). Guard with `ENABLE_BEDROCK` and return clear errors if disabled or access missing.
4. API endpoints
   - Ensure POST `/api/duo/ai` exists and uses `generateDuoInsights` with the computed DuoSummary.
   - Add POST `/api/player/ai` that accepts `{ jobId }` (or `{ puuid, region }` fallback), loads the PlayerSummary from storage, and returns `{ text }` from `generatePlayerInsights`.
   - CORS honors `FRONTEND_URL` (comma-separated origins allowed). Return JSON errors with helpful messages.
5. Infra/env
   - template.yaml: Lambda env includes `ENABLE_BEDROCK`, `BEDROCK_REGION`, `BEDROCK_MODEL_ID`; IAM allows `bedrock:InvokeModel`.
   - Validate `RIOT_SECRET_ID`, `DATA_BACKEND=s3` in prod.
6. Local smoke test affordances
   - If `ENABLE_BEDROCK=false`, still return a stub `{ text: "AI disabled in this environment." }` for fast UI testing.

# Prompt (Kickoff)
Implement and verify backend AI insights for That's My Duo:
- Review summaryGenerator.js and duoSummaryGenerator.js; add any missing fields described above.
- Implement/verify bedrock.js with `generatePlayerInsights` and `generateDuoInsights` using Claude 3 Haiku (Messages API).
- Add POST /api/player/ai and verify POST /api/duo/ai paths, CORS, and error handling.
- Ensure template.yaml has env/IAM for Bedrock and DATA_BACKEND=s3 in prod. Keep backend CommonJS; use uuid v9 only.
- Provide a short test plan in PR description and keep changes minimal and consistent with existing style.

# Coaching Prompt Skeletons (use/adapt in bedrock.js)
Player (playstyle + improvements):
"You are an expert League of Legends coach. Analyze this player’s recent ranked performance and playstyle. Be concise and actionable. Use 3–5 short bullets tied to the provided stats (no generic advice). Include strengths and 2–3 targeted improvements.\nData: <name, region, matches, winrate, KDA, kill participation, vision, damage share, top champs (wins/games), role distribution, frequent teammates top pairs>."

Duo (how to play together + improve):
"You are an expert League of Legends duo coach. Provide concise, actionable synergy advice for these two players. Use 3–5 short bullets. Cover strongest champion/role pairings, coordination strengths, lane/vision habits, and 2–3 specific improvements to raise win rate. Tie each point to the supplied stats.\nData: <players A+B, region, games together, wins, combined K+A, kill participation A/B, vision A/B, damage share A/B, top champion pairs (wins/games), top role pairs (wins/games), avg game length, side preference>."

# Definition of Done
- PlayerSummary contains playstyle metrics and frequentTeammates details used by AI.
- POST /api/player/ai returns a 3–5 bullet analysis tied to stats.
- POST /api/duo/ai returns synergy coaching text (how to play together + improve).
- Works locally (`DATA_BACKEND=fs`) and in prod (`DATA_BACKEND=s3`), with clear errors when Bedrock is disabled.

# Handoff Block
---
For Next Agent:
- Summary of current state:
- Top 3 next actions:
- Helpful context/links:
- Suggested prompt to continue:


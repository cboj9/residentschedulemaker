# CLAUDE.md — Medical Resident Scheduling SaaS

## Project Overview
Multi-tenant SaaS platform that auto-generates rotation schedules for medical residency programs. Target: nationwide rollout supporting any program type (FM, TY, PSYCH, IM, etc.).

Stack: Node.js / Express backend, PostgreSQL database.

## Domain Concepts
- **Block:** 4-week scheduling unit. 13 blocks per academic year.
- **Half-block (A/B):** Each block splits into A (weeks 1–2) and B (weeks 3–4). Stored as `two_week` in DB — must be mapped to `durationWeeks` in the generate route.
- **Rotation:** A clinical assignment (e.g., Adult IP, ICU, Surgery). Has `durationWeeks` (2 or 4), PGY-level restrictions, and a PTO-eligible flag.
- **PGY level:** Post-Graduate Year — determines which rotations a resident is eligible for.
- **PTO V1/V2:** Vacation in week 1 (V1) or week 2 (V2) of a block. PTO is first-class: tied to a specific rotation + block, captured in the `ptoWeeks` array on each assignment.
- **Program:** A residency training program (FM-PGY1, FM-PGY2, FM-PGY3, TY, PSYCH, etc.).
- **Shared service:** A hospital service that multiple programs staff concurrently (e.g., Adult IP, ICU). Modeled in `shared_services` + `rotation_shared_service` tables.

## Scheduling Algorithm
- Core loop: scoring → urgency → slack → assignment, run per block.
- **PTO alignment (scoring weights):**
  - +30 for PTO-eligible rotation when resident has PTO in that block
  - −40 for non-PTO-eligible rotation when resident has PTO in that block
  - PTO approval runs within the block loop — not as post-processing.
- **Cross-program coverage:** Before generating, query other programs' latest schedules. Pass `existingCoverage` (map of `rotationId → blockNumber → external resident count`) to the algorithm so it reduces urgency and skips already-covered slots.
- **Design intent:** Intelligent scheduling, not mechanical slot-filling. Prefer solutions that make clinical sense.

## Key Database Tables
- `shared_services` — hospital services shared across programs
- `rotation_shared_service` — join table linking rotations to shared services
- `two_week` column on rotations → maps to `durationWeeks` in the generate route (silent bug if this mapping is missing)

## Multi-Tenancy
- Not yet implemented — keep it in mind.
- Never hard-code program-specific logic. All differences between programs must be driven by data/configuration, not code branches.

## Code Standards
- Confirm root cause before patching. Silent failures (like the `two_week` → `durationWeeks` mapping gap) are the most dangerous class of bug here.
- Prefer explicit mappings at the query/route layer over implicit assumptions deeper in the algorithm.
- No ACGME compliance enforcement is a goal — focus on schedule quality and correctness.
- Do not add abstraction beyond what the current task requires.

# Schedule Maker

A teacher-first classroom schedule app built with React, TypeScript, and Vite.

## Current Status

Milestone `1.0` is built. The repository now has:

- a local-first React + TypeScript + Vite MVP
- a live classroom display page and local builder page
- baseline host-aware run scripts plus build and lint verification

## Planned MVP Surfaces

- Display page for the live classroom schedule
- Builder page for editing weekday blocks
- Optional lightweight landing page

## Llama Learners Launch Shell (Current)

The app now opens on a branded `Llama Learners` tool hub with:

- `Schedule Maker (Beta)` tool card
- `Curriculum Store` external link card (Teachers Pay Teachers)
- Open beta access for entering Show/Plan/Design
- Guided defaults with an `Advanced on/off` toggle in the top bar

### Beta Gate (Deferred)

Email verification-gate endpoints are deferred to a future release.
The current launch flow is open beta without sign-in.

Optional environment values:

- `VITE_CURRICULUM_STORE_URL` for your TPT store link

## Scripts

- `npm install`
- `npm run dev`
- `npm run host:dev -- --host 0.0.0.0 --port 8005`
- `npm run build`
- `npm run lint`
- `npm run preview`
- `npm run host:preview -- --host 0.0.0.0 --port 8005`
- `.\Start-ClassroomScheduleMaker.ps1`
- `.\Start-ClassroomScheduleMaker.ps1 -Mode preview`
- `.\start-8005.ps1`

## Local Host

This repo is host-capable and follows the global host-port directory contract.

- Resolve or register the repo port with `C:\dev\global-access\ai-write\host-directory\Resolve-Host-PortDirectory.ps1`
- For the simplest launch, use the repo script:
- `.\Start-ClassroomScheduleMaker.ps1`
- Or use the fixed-port wrapper that matches the other leased repos:
- `.\start-8005.ps1`
- For a production-style preview:
- `.\Start-ClassroomScheduleMaker.ps1 -Mode preview`
- The script reads the global host lease and currently binds to `0.0.0.0:8005` for LAN access.

## Planning Docs

- `.local/repo-governance/PRODUCT-PRD-BLUEPRINT.md`
- `.local/repo-governance/STATUS.md`
- `classroom_schedule_page_plan.md`

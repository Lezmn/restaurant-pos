---
target: หน้า order (ครัว) หลังแก้ P1/P2
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\OrderPage.tsx"
target_fingerprint: "sha256:821303f6843fac83980f243a9cf7e8397f55e943b6f6d4826b5147ad4bd140ca"
target_path: "C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\OrderPage.tsx"
timestamp: 2026-10-25T16-57-53Z
slug: frontend-src-pages-employee-orderpage-tsx
---
Method: dual-agent (A: design review · B: detector)

## Design Health Score: 24/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | No live/poll freshness indicator |
| 2 | Match real world | 3 | Ticket metaphor and copy fit |
| 3 | User control | 2 | No undo; backend allows forward-only |
| 4 | Consistency | 3 | Sound toggle raw green; ConfirmDialog buttons smaller than board |
| 5 | Error prevention | 2 | "ทำเสร็จแล้ว" one irreversible tap |
| 6 | Recognition | 3 | Tickets self-contained |
| 7 | Flexibility | 1 | No bulk/shortcuts/compact mode |
| 8 | Minimalism | 3 | Wake-lock text, free-table count in kitchen shell |
| 9 | Error recovery | 2 | Page-level ErrorNote not tied to ticket, sticks |
| 10 | Help | 2 | No help |

Detector: 0 findings. Browser overlay skipped (browser signed in as STAFF).

## Priority Issues
- [P1] Advance to SERVED is irreversible one-tap -> harden (undo toast / hold)
- [P2] "ใหม่" badge shows ~0-30s not 1 min (Math.round in waitedMinutes) -> polish
- [P2] Mutation errors unattributed and sticky -> harden
- [P2] Columns don't scroll independently; shell eats height -> adapt

## Minor
- Same accessible name per ticket button; focus lost on column move; checked map never pruned; cancel doesn't set busy; done column oldest-first; sound unlock CTA 14px; item rows 40px.

---
target: หน้า order (ครัว)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\OrderPage.tsx"
target_fingerprint: "sha256:322dd2dc3b57dd90f79d11b5a563f54fc601e7b40ec620b7294f4f5a276720e4"
target_path: "C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\OrderPage.tsx"
timestamp: 2026-10-25T16-46-55Z
slug: frontend-src-pages-employee-orderpage-tsx
---
Method: dual-agent (A: design review · B: detector)

## Design Health Score: 23/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | Busy = opacity only; no live/last-updated indicator |
| 2 | Match real world | 3 | "รอมาแล้ว N นาที" still counts on done tickets |
| 3 | User control | 2 | Clearing done ticket has no undo; cancel shown on SERVED |
| 4 | Consistency | 2 | "ทำเสร็จแล้ว" vs "ทำเสร็จเรียบร้อย"; hand-rolled buttons; cancel always-red vs DESIGN.md spec |
| 5 | Error prevention | 2 | Full-width cancel 8px under primary; leaky per-ticket lock |
| 6 | Recognition | 3 | One action per column, consistent status colors |
| 7 | Flexibility | 1 | No bulk clear; item checks local per tablet |
| 8 | Minimalism | 3 | Queue ticket stacks four reds |
| 9 | Error recovery | 3 | LoadError good; cancel dialog shows shared mutation error |
| 10 | Help | 2 | Lateness threshold unexplained |

Detector: 0 findings (OrderPage.tsx, LoadError.tsx). Browser overlay skipped (browser signed in as STAFF).

## Priority Issues
- [P1] Per-ticket lock leaks: useMutation tracks only latest variables (OrderPage.tsx:288-290); cancel dialog shares updateStatus (361-362) -> harden
- [P1] Lateness/notes not legible at 1m: wait time 14px, late red ≈ queue red; notes 14px -> typeset, clarify
- [P1] Cancel placement/scope: full-width under primary, shown on done column, contradicts DESIGN.md spec -> distill
- [P2] No aria-live for new orders/moves; busy keeps label; skeleton silent -> harden
- [P2] Done-column copy confusing ("ทำเสร็จเรียบร้อย" clears ticket) -> clarify

## Minor
- Empty-state gray-400 2.5:1; wait time doesn't tick; hover brightness on touch device; sound toggle uses raw green; JSX indentation off; ErrorNote merges two mutations.

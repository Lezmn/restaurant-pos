---
target: employee side (quick pass)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee"
timestamp: 2026-10-25T16-37-19Z
slug: frontend-src-pages-employee
---
Method: dual-agent (A: design review · B: detector)

## Design Health Score: 25/40 (Acceptable)
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of status | 3 | Kitchen has no error state / last-updated |
| 2 | Match real world | 2 | English tabs, raw role "STAFF", "VITE_PROMPTPAY_ID" shown to cashier |
| 3 | User control | 3 | No undo for kitchen status moves |
| 4 | Consistency | 2 | Cooking column brand-300 not status-cooking; hand-rolled kitchen buttons |
| 5 | Error prevention | 3 | Done-column clear sits next to cancel |
| 6 | Recognition | 3 | Icon-only nav on phones |
| 7 | Flexibility | 3 | No keyboard path to take payment |
| 8 | Minimalism | 2 | PaymentDialog stacks ~9 controls; header free-table count everywhere |
| 9 | Error recovery | 2 | OrderPage ignores isError -> "ไม่มีรายการ" on fetch failure |
| 10 | Help | 2 | No guidance for slip scanner |

## Detector: 0 findings (employee dir + EmployeeLayout.tsx). Browser overlay skipped (login required).

## Priority Issues
- [P0] Kitchen board shows "ไม่มีรายการ" when fetch fails (OrderPage.tsx:177,219,244) -> harden
- [P1] White text on status-queue/done buttons ~3.4-3.6:1; cooking column off-token (OrderPage.tsx:105,136,283) -> colorize, polish
- [P1] PaymentDialog one long scroll at riskiest moment (CheckPage.tsx:565-810) -> distill, layout
- [P2] Shell speaks developer: English tabs, STAFF role, env var names (EmployeeLayout.tsx:95-98,155-160) -> clarify
- [P2] Kitchen ticket type too small for arm's length (OrderPage.tsx:43,53) -> typeset, bolder

## Minor
- Orphaned quickCash doc comment (CheckPage.tsx:814-818); kitchen loading is text, others skeleton; cancel turns red only on hover; checkout tile only 2px border; tile pay button default size, amount 24px vs 30px spec.

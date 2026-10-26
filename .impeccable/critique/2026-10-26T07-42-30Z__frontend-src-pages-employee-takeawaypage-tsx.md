---
target: Takeaway POS page
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\TakeawayPage.tsx"
target_fingerprint: "sha256:7180550463491f9459a27191da6f3fabc9f2c21b2d00db3dd150bf5365e12853"
target_path: "C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\employee\\TakeawayPage.tsx"
timestamp: 2026-10-26T07-42-30Z
slug: frontend-src-pages-employee-takeawaypage-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score (before fixes): 24/40 — Acceptable
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | In-cart border never showed (class conflict) |
| 2 | Match system / real world | 3 | Empty cart said "กดเมนูทางซ้าย" but cart is below on tablet/mobile |
| 3 | User control and freedom | 2 | "ล้างตะกร้า" wiped the cart with no undo |
| 4 | Consistency and standards | 2 | 40px chips, pay buttons without amount, Ink Rule breaks |
| 5 | Error prevention | 3 | Sold-out lines block send; double-send locked |
| 6 | Recognition rather than recall | 3 | Option prices "+20" without ฿; selection by colour only |
| 7 | Flexibility and efficiency | 2 | No keyboard path, no "/" search |
| 8 | Aesthetic and minimalist design | 2 | Ragged grid, dead white space, broken images |
| 9 | Error recovery | 2 | Broken images had no fallback |
| 10 | Help and documentation | 2 | Pay buttons unexplained |

## Priority issues
1. [P0] Menu cards broke the 4:3 rule: img h-full inside aspect box let portrait photos grow the box (273px vs 154px); li.flex stretched rows; justify-between put the extra height between name and price.
2. [P1] No onError fallback for menu images (dead example.com seed URLs showed the browser broken-image icon).
3. [P1] Pay buttons showed no amount; cash and PromptPay identical primaries.
4. [P1] In-cart border-brand-400 appended after border-gray-200 never applied.
5. [P1] Touch targets under 44px: chips 40, clear-cart 62x20, cart remove 33x40, stepper sm 28.
6. [P2] Contrast: text-amount #e65100 on white 3.8:1 for 16px card prices and 14px cart prices (detector: low-contrast x3); text-success / text-danger on read-only text; queue pills not using fixed status colours.

## Persona red flags
- Alex (lunch rush cashier): no "/" search, clear-cart misfire, sold-out items mixed into the grid.
- Casey (tablet in hand): cart started at y=1258 on 768x1024; floating bar covered cards.
- Sam (a11y): category chips used role=tab without panels; option selection colour-only; no live announcement on add.

## Minor
Skeleton 4:5 vs 4:3 cards; emoji plate placeholder; dashed border on "+ รายการพิเศษ"; orange "ราคาเปิด" badge on read-only text; custom price placeholder "0".

## Detector
CLI: 0 findings. Browser overlay: 3x low-contrast (text-amount on white) at TakeawayPage.tsx card price; real issue, under-reported (all 7 prices failed). Shared header targets (device-name button 20px) out of scope.

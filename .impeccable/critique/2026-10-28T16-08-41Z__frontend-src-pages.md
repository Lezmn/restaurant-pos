---
target: ทุกหน้าฝั่งพนักงาน ครัว และเจ้าของร้าน
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages"
timestamp: 2026-10-28T16-08-41Z
slug: frontend-src-pages
---
# Critique: staff, kitchen, owner (frontend/src/pages), 2026-10-28
Method: dual-agent (A design review, B detector). DESIGN.md not treated as binding.

## Heuristics: 25/40 (Acceptable)
1 Status 3 · 2 Real world 2 · 3 Control 3 · 4 Consistency 2 · 5 Error prevention 2 · 6 Recognition 3 · 7 Efficiency 2 · 8 Minimalist 2 · 9 Recovery 3 · 10 Help 3

## Design specificity
Distinctive behaviour (money flows, drawer ledger, cash-close warnings, Sales advice). Generic Tailwind-admin look. The "order slip" concept is missing from the kitchen tickets.
Detector: 1 side-tab at OrderPage.tsx:105 (note callout). Live overlay: only low-contrast on the accepted Tables brand-300 buttons (2.3:1), ปิดโต๊ะ text-danger (4.4:1) and Finance "+ รายจ่าย" bg-danger (4.4:1).

## Priority issues
- [P1] Owner numbers disagree: cash-closes shows green "ตรง"/"0 วัน" with no closes (differenceLabel(0)). Dashboard bills vs orders, top menu vs revenue, Sales peak hour vs heatmap (seen on demo data). Fix: one definition per metric, neutral "ยังไม่ได้ปิดยอด". clarify + harden
- [P1] Kitchen board on portrait tablet: 190px tickets, titles wrap 3 lines, columns scroll internally, every ticket red. Fix: portrait focus column + collapsed counts, tiered overdue, oldest first, cancel below title. adapt + distill
- [P1] Owner mobile: Finance amount column off-screen, cash-close empty state hidden in the scroller, heatmap starts at 00:00, 6 stacked stat cards. adapt
- [P2] Destructive actions near frequent ones: ปิดโต๊ะ under the primary, ลบ on the user card, slip-confirm reason only @IsNotEmpty. harden
- [P2] English nav / Gregorian date inputs in a Thai UI. clarify (E2E selectors affected)

## Personas
พี่ครัว: wrapped titles, cancel next to title, internal column scroll, all-red. แคชเชียร์: small รับเงิน on the tile without the amount, requests mixed, QR bulk on Tables. Alex: Requests/Orders not in nav, 21-option audit select. Sam: faded disabled pay buttons, 12px pills, heatmap shades only.

## Minor
Manage "ไข่ หมด" vs switch on; Sales ranks water first; header name truncated; Takeaway has no ready signal.

## Questions
Single "next up" kitchen list? One-sentence owner summary instead of 6 cards? Drive the next pass by usage scenes rather than tokens?

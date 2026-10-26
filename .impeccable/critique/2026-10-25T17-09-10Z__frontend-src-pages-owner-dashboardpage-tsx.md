---
target: owner dashboard
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\owner\\DashboardPage.tsx"
target_fingerprint: "sha256:9782aa507148af4113dc822e789d0981600dec0c4225699737650be8a9bb49ca"
target_path: "C:\\Users\\Poo\\Desktop\\restaurant-pos\\frontend\\src\\pages\\owner\\DashboardPage.tsx"
timestamp: 2026-10-25T17-09-10Z
slug: frontend-src-pages-owner-dashboardpage-tsx
---
Method: dual-agent (A: design review · B: detector + browser overlay)

Score before fixes: 19/40 (Poor). H1 2, H2 2, H3 3, H4 1, H5 3, H6 2, H7 1, H8 2, H9 1, H10 2.

Detector: CLI 0 findings on 4 files. Browser overlay: 6 low-contrast findings (sidebar brand name 3.2:1, nav label 2.9:1, footer 2.5:1, cash stat value brand-300 2.3:1, olive order count 2.2:1, empty state gray-400 2.6:1). Mobile: no page overflow; nav targets 40px.

Priority issues:
- [P1] Stat values and orange text fail contrast and break the DESIGN.md Ink and Orange Means Touch rules. PromptPay shown in purple instead of the promptpay token.
- [P1] Loading and error states don't use PageLoading/LoadError. No retry, raw error.message shown, no stale warning.
- [P1] "N นาทีที่แล้ว" freezes and grows to "300 นาทีที่แล้ว".
- [P2] Hierarchy doesn't answer "how is today going". Net profit not shown, cash/PromptPay duplicated, no h1, fake date button.
- [P2] Chart text about 6px on mobile, odd ticks, aria-label reports the axis ceiling instead of the peak.

Fixed in the same run (2026-10-26). All of the above, plus sidebar contrast, 44px nav targets, RESTAURANT_NAME, and the 2-up stat grid on mobile.

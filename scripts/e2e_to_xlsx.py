"""Convert Playwright JSON reports into an Excel test-result workbook.

Usage: python -X utf8 scripts/e2e_to_xlsx.py out.xlsx report1.json [report2.json ...]
Later reports override earlier ones for the same test (use for reruns).
"""
import json, re, sys
from collections import Counter
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

def walk(suite, trail=()):
    for s in suite.get("suites", []):
        yield from walk(s, trail + ((s["title"],) if s.get("title") else ()))
    for spec in suite.get("specs", []):
        for t in spec["tests"]:
            res = t["results"][-1] if t["results"] else {}
            status = {"expected": "ผ่าน", "unexpected": "ไม่ผ่าน", "flaky": "ผ่าน (flaky)", "skipped": "ข้าม"}.get(t["status"], t["status"])
            err = re.sub(r"[[0-9;]*m", "", (res.get("error") or {}).get("message", ""))
            yield (spec["file"], spec["title"], status, res.get("duration", 0) / 1000, err[:300])

rows = {}
for path in sys.argv[2:]:
    data = json.load(open(path, encoding="utf-8"))
    for suite in data["suites"]:
        for f, title, st, dur, err in walk(suite):
            old = rows.get((f, title))
            if st == "ข้าม" and old and old[2] != "ข้าม":
                continue  # a skip never hides an earlier real result
            rows[(f, title)] = (f, title, st, round(dur, 1), err)
rows = sorted(rows.values())

wb = Workbook()
ws = wb.active; ws.title = "E2E Results"
ws.append(["#", "ไฟล์ (spec)", "ชื่อเทสต์", "ผลลัพธ์", "เวลา (วินาที)", "Error"])
fills = {"ผ่าน": "C6EFCE", "ผ่าน (flaky)": "FFEB9C", "ไม่ผ่าน": "FFC7CE", "ข้าม": "D9D9D9"}
for i, r in enumerate(rows, 1):
    ws.append([i, *r])
    ws.cell(i + 1, 4).fill = PatternFill("solid", fgColor=fills.get(r[2], "FFFFFF"))
for c in ws[1]:
    c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="305496")
for col, w in zip("ABCDEF", (5, 38, 80, 14, 14, 60)):
    ws.column_dimensions[col].width = w
for row in ws.iter_rows(min_row=2):
    for c in row: c.alignment = Alignment(vertical="top", wrap_text=True)
ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions

sm = wb.create_sheet("Summary", 0)
cnt = Counter(r[2] for r in rows)
sm.append(["สถานะ", "จำนวน"])
for k in ("ผ่าน", "ผ่าน (flaky)", "ไม่ผ่าน", "ข้าม"):
    sm.append([k, cnt.get(k, 0)])
sm.append(["รวม", len(rows)])
sm.append([])
sm.append(["ไฟล์ spec", "ผ่าน", "ไม่ผ่าน", "ข้าม", "รวม"])
per = {}
for f, _, st, _, _ in rows:
    per.setdefault(f, Counter())[st] += 1
for f, c in sorted(per.items()):
    sm.append([f, c["ผ่าน"] + c["ผ่าน (flaky)"], c["ไม่ผ่าน"], c["ข้าม"], sum(c.values())])
for c in sm[1]: c.font = Font(bold=True)
sm.column_dimensions["A"].width = 45
wb.save(sys.argv[1])
print(dict(cnt), len(rows))

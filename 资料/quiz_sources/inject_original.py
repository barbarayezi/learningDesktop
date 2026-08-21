# -*- coding: utf-8 -*-
import re
html_path = "D:/01_Projects/learningDesktop/index.html"
html = open(html_path, encoding="utf-8").read()
new_block = open("D:/01_Projects/learningDesktop/资料/quiz_sources/original_quiz.js", encoding="utf-8").read().rstrip()
if new_block.endswith(","):
    new_block = new_block[:-1]  # drop trailing comma; we add leading comma + keep JS valid

pat = re.compile(r'(const\s+QUIZ\s*=\s*\[)(.*?)(\];)', re.S)

m = pat.search(html)
if not m:
    raise SystemExit("QUIZ array not found")

body = m.group(2)
# ensure the existing last entry ends cleanly; prefix new block with a comma+newline
injected = body.rstrip()
if not injected.endswith("},"):
    # make sure we separate properly
    injected = injected.rstrip(",")
# insert: existing body (already ends with }) , then new entries
replacement = m.group(1) + body.rstrip().rstrip(",") + ",\n" + new_block + m.group(3)
new_html = pat.sub(lambda mm: replacement, html, count=1)

# verify count
big = max(re.findall(r'<script>(.*?)</script>', new_html, re.S), key=len)
mc = re.search(r'const\s+QUIZ\s*=\s*\[(.*?)\];', big, re.S)
cnt = len(re.findall(r'\{\s*d\s*:', mc.group(1)))
print("QUIZ entries after inject:", cnt)
open(html_path, "w", encoding="utf-8").write(new_html)
print("written index.html")

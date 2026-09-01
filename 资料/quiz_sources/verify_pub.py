# -*- coding: utf-8 -*-
import re, urllib.request, sys
B = "https://test-d5gf0o9ky7d34beaf-1469471831.tcloudbaseapp.com"
url = B + "/?_cb=" + str(__import__("time").time())
req = urllib.request.Request(url, headers={"Cache-Control":"no-cache","Pragma":"no-cache"})
try:
    data = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "replace")
except Exception as e:
    print("FETCH_ERROR", e); sys.exit(1)
m = re.search(r'const\s+QUIZ\s*=\s*\[(.*?)\];', data, re.S)
cnt = len(re.findall(r'\{\s*d\s*:', m.group(1))) if m else "NONE"
print("public index.html chars:", len(data))
print("public QUIZ entries:", cnt)
checks = {
  "CSDN r1 题上线": "关于数据的描述，以下不正确的选项是哪项",
  "原创50 题上线(治理)": "数据治理的定义强调的是",
  "原创50 题上线(DMBOK)": "DAMA 数据管理知识体系（DMBOK）涵盖",
  "每日轮换按钮文案": "每日抽 5",
  "打乱开关按钮": "btn-shuffle",
}
for label, s in checks.items():
    print(("OK  " if s in data else "MISS") + " " + label)

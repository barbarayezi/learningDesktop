import segno

# 指向你部署后的短入口（Cloudflare Pages 项目名用 cdga -> cdga.pages.dev）
TARGET = "https://cdga.pages.dev"

qr = segno.make(TARGET, error="h")
# 独立二维码文件（可单独使用）
qr.save(r"D:/01_Projects/learningDesktop/landing-page/qr.svg",
        scale=9, dark="#1e1b4b", light="#ffffff", border=2)
# 内联 SVG（用于卡片页，离线也能显示）
svg = qr.svg_inline(scale=9, dark="#1e1b4b", light="#ffffff", border=2)

html = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>数据职业发展学习桌面 · 扫码进入</title>
<style>
  *{box-sizing:border-box;}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
    background:linear-gradient(135deg,#eef2ff 0%,#faf5ff 50%,#eff6ff 100%);
    padding:24px;color:#1e293b;}
  .card{background:#fff;border-radius:24px;padding:40px 34px;max-width:340px;width:100%;
    text-align:center;box-shadow:0 20px 60px rgba(99,102,241,.18);}
  .badge{width:64px;height:64px;margin:0 auto 16px;border-radius:18px;
    background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;
    justify-content:center;font-size:30px;box-shadow:0 10px 24px rgba(139,92,246,.35);}
  h1{font-size:20px;font-weight:700;letter-spacing:.5px;}
  .sub{margin-top:6px;font-size:13px;color:#64748b;}
  .qr{margin:24px auto 10px;width:200px;height:200px;}
  .qr svg{width:100%;height:100%;display:block;}
  .frame{background:#fff;border-radius:16px;padding:10px;box-shadow:0 6px 18px rgba(30,27,75,.10);}
  .url{margin-top:16px;font-size:13px;font-weight:700;color:#4f46e5;word-break:break-all;}
  .tip{margin-top:6px;font-size:11px;color:#94a3b8;}
  @media print{body{background:#fff;}.card{box-shadow:none;}}
</style>
</head>
<body>
  <div class="card">
    <div class="badge">📚</div>
    <h1>数据职业发展学习桌面</h1>
    <div class="sub">扫码进入你的学习空间</div>
    <div class="qr"><div class="frame">__SVG__</div></div>
    <div class="url">cdga.pages.dev</div>
    <div class="tip">微信 / 相机扫一扫即可打开</div>
  </div>
</body>
</html>
"""

html = html.replace("__SVG__", svg)
with open(r"D:/01_Projects/learningDesktop/landing-page/qr-card.html", "w", encoding="utf-8") as f:
    f.write(html)
print("OK: qr-card.html + qr.svg generated")

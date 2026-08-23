"""
把 CSDN r1/r2 两个文件合成成 QUIZ 数组追加格式。
按 DMBOK 章节给每题打 domain 标签。
"""
import json
import os

# 域映射（按 CSDN 出题顺序）
def get_domain(src, n):
    if src == "csdn-r1":
        if 1 <= n <= 4: return "十一、数据管理概述"  # 数据描述、特征、价值
        if n in (5,):    return "十二、数据处理伦理"  # 隐私法
        if 6 <= n <= 11:  return "一、数据治理"  # 伦理准则/程序/战略
        if 12 <= n <= 17: return "七、数据架构"  # 架构
        if 18 <= n <= 27: return "六、数据建模与设计"  # 数据库/建模
        if n in (28, 29): return "十一、数据管理概述"  # 角色
        if 30 <= n <= 37: return "七、数据架构"  # 分布式/CAP/SCD 存储
        if 38 <= n <= 42: return "八、数据安全"  # 4A/脱敏/渗透
        if 43 <= n <= 50: return "十三、其余低分域"  # 数据集成与互操作
    if src == "csdn-r2":
        if 1 <= n <= 8:   return "十三、其余低分域"  # 文件内容
        if 9 <= n <= 12:  return "五、参考数据和主数据"
        if 13 <= n <= 17: return "四、数据仓库与BI"
        if 18 <= n <= 23: return "三、元数据管理"
        if 24 <= n <= 32: return "二、数据质量"
        if 33 <= n <= 37: return "九、大数据和数据科学"
        if 38 <= n <= 40: return "十、成熟度评估"
        if 41 <= n <= 50: return "十三、其余低分域"  # 组织/变革/沟通
    return "十三、其余低分域"

def to_quiz_line(item, idx_offset):
    """生成 QUIZ 数组的一行 JS（每行一个题），idx 从 52 开始（已有 52 题）"""
    domain = get_domain(item["src"], item["n"])
    q = item["q"].replace("'", "\\'")
    options = item["o"]
    # 4 选项
    opts_js = "[" + ",".join(f"'{o.replace(chr(39), chr(39)*2)}'" for o in options) + "]"
    # 但用 chr(39)*2 替换有 BUG，应用更稳妥的双单引号转义
    opts_js = "[" + ",".join("'" + o.replace("'", "''") + "'" for o in options) + "]"
    a = item["a"]
    note = item.get("ans_note", "")
    explain = "网友回忆版 · CC BY-SA 4.0 · weixin_44586883" + (f" · 答案推断：{note}" if note else "")
    explain = explain.replace("'", "''")
    q_esc = q.replace("'", "''")
    return f" {{d:'{domain}',q:'{q_esc}',o:{opts_js},a:'{a}',e:'{explain}',s:'{item['src']}',n:{item['n']}}},"

# 读两个 JSON
base = r"D:\01_Projects\learningDesktop\资料\quiz_sources"
items = []
with open(os.path.join(base, "csdn_r1.json"), "r", encoding="utf-8") as f:
    items.extend(json.load(f))
with open(os.path.join(base, "csdn_r2.json"), "r", encoding="utf-8") as f:
    items.extend(json.load(f))

# 输出
lines = []
for item in items:
    lines.append(to_quiz_line(item, 52))

with open(os.path.join(base, "csdn_combined.js"), "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"生成 {len(lines)} 题")
print("=== 域分布 ===")
from collections import Counter
domains = Counter(get_domain(it["src"], it["n"]) for it in items)
for d, c in sorted(domains.items()):
    print(f"  {d}: {c}")
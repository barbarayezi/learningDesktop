#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
定时抓取「考证(DAMA/数据治理) + 考博(交大在职博士)」相关公众号文章，写入 资料/articles.js。

设计（对应需求：实时跟踪官方 + 知名第三方公众号，选取适合看的文章进学习计划）：
1. 关键词发现（QUERIES）：覆盖考证/考博主题，自动归类、过滤广告与噪音。
2. 账号定向跟踪（ACCOUNTS）：把「官方 + 知名有用的第三方」公众号列成白名单，
   逐个用账号名检索其最新文章，fuzzy 匹配 r.account 只保留该账号自己的推文，
   强制归类并标记 tracked=True（官方/精选账号的推文默认保留，不过广告滤）。
3. 去重：归一化(标题|账号) 去重，已入库的不重复添加。
4. 导出 window.SOURCES：被跟踪账号的最新文章日期 + 篇数，供网站「📡 关注源」页展示。
5. 全文：脚本只可靠抓【元数据+摘要】；逐字全文由 AI(WebFetch) 补充（说「刷新全文」即可）。

用法：
  python3 harvest_articles.py
  （配合 launchd 每日 09:00 / 20:00 自动运行，见 com.barbara.dama-news.plist）
"""
import sys, os, re, json, html, hashlib, datetime

SKILL = "/Users/barbara/.workbuddy/plugins/marketplaces/cb_teams_marketplace/plugins/deep-research/skills/wechat-article-search/scripts"
if os.path.isdir(SKILL):
    sys.path.insert(0, SKILL)
import sogou_search as s

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "articles.js")

# 检索关键词：考证(DAMA/数据治理) + 考博(交大在职博士/工程博士 + 通用考博策略)
QUERIES = [
    # —— 考证：DAMA / 数据治理 / 数据资产 ——
    "DAMA CDGA 数据治理 备考",
    "CDGP 数据治理 专家 考试",
    "DAMA中国 数据治理 认证 含金量",
    "CDAM 数据资产管理师",
    "数据治理 工程师 考试时间",
    "DMBOK 数据管理 知识体系 笔记",
    "CDGA 考试 报名 2026",
    "数据治理 人才 缺口 认证 前景",
    # —— 考博：交大在职博士 / 工程博士 / 申请考核 ——
    "上海交通大学 博士招生 在职",
    "上海交通大学 工程博士 申请 条件",
    "考博 申请考核制 研究计划书 怎么写",
    "博士 推荐信 导师 怎么找",
    "在职博士 报名 条件 2026",
    "博士 复试 经验 准备",
    "国外学历认证 留学服务中心 博士",
    "上海交通大学 研究生招生 简章 博士",
]

# 账号定向跟踪：官方 + 知名有用的第三方
# (检索用的账号名, 归类, 展示名)
ACCOUNTS = [
    # ===== 考证 / DAMA / 数据治理 / 数据资产（官方 + 行业知名号）=====
    ("DAMA中国", "考证", "DAMA中国"),
    ("MyDAMA", "考证", "MyDAMA"),
    ("数据治理研究院", "考证", "数据治理研究院"),
    ("数据学堂", "考证", "数据学堂"),
    ("DATABOK数博库", "考证", "DATABOK数博库"),
    ("光环国际咨询培训中心", "考证", "光环国际"),
    ("立言研究院", "考证", "立言研究院"),
    ("数据要素社", "考证", "数据要素社"),
    ("数据观", "考证", "数据观"),
    ("数据派THU", "考证", "数据派THU"),
    ("御数坊", "考证", "御数坊"),
    ("志明与数据", "考证", "志明与数据"),
    ("金子说数据", "考证", "金子说数据"),
    ("CDO首席数据官", "考证", "CDO首席数据官"),
    ("大数据DT", "考证", "大数据DT"),
    # ===== 考博 / 交大在职博士（官方 + 考博行业知名号）=====
    ("上海交通大学研究生招生办", "考博", "上海交大研招办"),
    ("上海交大研究生教育", "考博", "上海交大研究生教育"),
    ("上海交通大学继续教育学院", "考博", "上海交大继续教育学院"),
    ("考博圈", "考博", "考博圈"),
    ("考博日报", "考博", "考博日报"),
    ("学术志", "考博", "学术志"),
    ("青塔", "考博", "青塔"),
    ("硕博人才", "考博", "硕博人才"),
    ("考博前辈", "考博", "考博前辈"),
    ("读博前线", "考博", "读博前线"),
    ("学术之路", "考博", "学术之路"),
    ("博士号", "考博", "博士号"),
    ("问津学术圈", "考博", "问津学术圈"),
    ("高校硕博讯", "考博", "高校硕博讯"),
    ("工程博士申请服务", "考博", "工程博士申请服务"),
]

# 账号定向检索的时间窗口（天）：聚焦近期最新，避免把几年前的旧文反复拉回
ACCOUNT_RECENT_DAYS = 150

# 考证相关性关键词（DAMA 体系 / 数据治理）
DAMA_KW = ["dama","cdga","cdgp","cdam","cdmp","dmbok","数据治理","数据资产","数据管理认证","数据治理工程师"]
# 考博相关性关键词（博士 / 交大 / 申请考核）
PHD_KW = ["博士","考博","研究生招生","在职博士","工程博士","申请考核","研究计划书","推荐信","复试","简章","学历认证","上海交通大学","交大","导师","非全日制","非全"]

# —— 精选账号的「有用性」过滤（只保留值得放进学习计划的文章）——
# 招聘/招生广告/课程营销：一律不要
REC_AD = ["招人","招募","招聘","征稿","课程","vip","讲座","微信群","招新","加入我们",
          "招募令","合伙人","实习","求职","高薪","限额","优惠","公开课","培训班",
          "开班","特训营","首期培训","保过","包过","招生火爆","招贤纳士","诚聘"]
# 考证类：必须真的是「数据治理/数据资产/DAMA 体系」干货
SUBSTANCE_KW = ["数据治理","数据资产","数据要素","cdga","cdgp","cdam","cdmp","dama",
                "dmbok","数据管理认证","首席数据官","御数坊","立言"]
# 考博类：必须真的是「博士/考博/申请/招生/复试/研究计划/推荐信」等干货
PHD_USEFUL = ["博士","考博","招生","申请","复试","研究计划","推荐信","导师","学历认证",
              "非全","工程博士","在职博士","申请考核","简章","备考","上岸","研究生",
              "分数线","推免","保研","材料审核","综合考核","经验","心得"]
# 其他院校（非交大）的招生/经验，对申交大价值低，除非是通用考博策略
OTHER_SCHOOL = ["人大","北大","清华","北中医","浙江海洋","运动科学","中国社会科学院",
                "中科大","中国科学技术大学","复旦","南大","武大","中山","厦大","天大",
                "西交","哈工大","北师大","中国政法","中央财经","西北政法","苏州","同里","海大"]
# 考博类里纯机构新闻/社会新闻，不要
PHD_NEWS = ["卫星","通报","逝世","院士","发布情况","点赞","央视","数字货币","龙虾大会",
            "发射卫星","情况通报","声明","挂牌","揭牌"]

def useful(title, digest, cat):
    t = (title + " " + (digest or "")).lower()
    if any(k.lower() in title.lower() for k in REC_AD):
        return False
    if cat == "考证":
        if not any(k.lower() in t for k in SUBSTANCE_KW):
            return False
        return True
    if cat == "考博":
        if not any(k.lower() in t for k in PHD_USEFUL):
            return False
        if any(k in title for k in PHD_NEWS):
            return False
        if any(s in title for s in OTHER_SCHOOL):
            # 其他院校：仅保留通用考博策略（研究计划/推荐信/复试/申请考核/备考/学历认证）
            if any(k in t for k in ["研究计划","推荐信","复试","申请考核","备考",
                                     "学历认证","怎么写","经验分享","心得","上岸"]):
                return True
            return False
        return True
    return True

TAGS_KW = {
    "考试时间": ["时间", "场次", "报名", "考试城市", "统考"],
    "认证体系": ["认证", "体系", "等级", "持证", "证书", "资质"],
    "含金量": ["含金量", "价值", "值得", "缺口", "前景", "必要"],
    "备考经验": ["经验", "心得", "复习", "备考", "通过", "上岸", "通关", "笔记"],
    "考试形式": ["题型", "机考", "单选", "多选", "论述", "建模", "闭卷", "冲刺"],
    "费用": ["费用", "原价", "学生", "折扣", "¥", "元", "报名费"],
    "有效期": ["有效", "年审", "续证", "终身", "维持"],
    "招生简章": ["招生简章", "招生说明", "招生专业目录", "网报"],
    "申请考核": ["申请考核", "申请-考核", "综合考核", "材料审核"],
    "研究计划": ["研究计划", "科研计划", "proposal", "选题"],
    "推荐信": ["推荐信", "专家推荐", "导师推荐"],
    "复试": ["复试", "面试", "笔试", "英语口语"],
    "学历认证": ["学历认证", "留服", "cscse", "学位认证"],
    "时间节点": ["时间节点", "时间线", "倒推", "日程", "ddl"],
}

def clean(t):
    return html.unescape((t or "").replace("\u200b", "").strip())

def norm(t):
    t = clean(t).lower()
    t = re.sub(r"[\s\u3000]+", "", t)
    t = re.sub(r"[，。、！？!?；;：:（）()\"'·…—\-_|｜&]+", "", t)
    return t

def fuzzy(a, b):
    """账号名 fuzzy 匹配：去掉常见后缀后做包含判断"""
    stop = ["官方", "公众号", "平台", "资讯", "编辑部", "订阅号", "服务号", "中心", "学院", "大学"]
    def f(x):
        x = norm(x)
        for st in stop:
            x = x.replace(st, "")
        return x
    na, nb = f(a), f(b)
    if not na or not nb:
        return False
    return na in nb or nb in na

def assign_cat(title, text):
    t = (title + " " + text).lower()
    dama = any(k.lower() in t for k in DAMA_KW)
    phd = any(k.lower() in t for k in PHD_KW)
    if dama:
        return "考证"
    if phd:
        return "考博"
    return None

def infer_tags(text):
    tags = [t for t, kws in TAGS_KW.items() if any(k in text for k in kws)]
    return tags[:5] if tags else ["认证体系"]

def load_existing():
    if not os.path.exists(OUT):
        return []
    try:
        code = open(OUT, encoding="utf-8").read()
        m = re.search(r"window\.ARTICLES\s*=\s*(\[.*?\]);", code, re.S)
        if m:
            arr = json.loads(m.group(1))
            for a in arr:
                if not a.get("cat"):
                    a["cat"] = assign_cat(a.get("title", ""),
                                          " ".join(a.get("points", [])) or a.get("content", "")) or "考证"
            return arr
    except Exception:
        pass
    return []

# 海外(国外)语境文章：仅作用于「考博」类，用于把纯国外经验从每日核心流降级到「拓展·海外」
# 只认强国外-system 信号（英国/美国/香港中文大学/留服/学历认证/海外学历…）；
# 纯推荐信/套磁手艺文标题不含这些词，不会被误伤（国内外通用，保留在核心流）。
OVERSEAS_RE = re.compile(r"(英国|美国|加拿大|澳洲|澳大利亚|欧洲|新加坡)\s*博士|香港中文大学|国外博士|留服|学历认证|海外学历|国\(境\)外学历|境外学历|出国读博")
def region_for(title, cat):
    if cat != "考博":
        return None
    return "overseas" if OVERSEAS_RE.search(title or "") else None

def make_entry(title, account, digest, url, cat, tracked=False, source=""):
    return {
        "id": "a" + hashlib.md5(title.encode("utf-8")).hexdigest()[:10],
        "title": title,
        "account": account,
        "date": "",
        "cat": cat,
        "tags": infer_tags(title + " " + (digest or "")),
        "url": url,
        "points": [digest] if digest else ["（待 AI 抓取全文要点）"],
        "content": "",   # 逐字全文由 AI(WebFetch) 补充
        "auto": True,
        "tracked": tracked,
        "source": source,
        "region": region_for(title, cat),
    }

def main():
    existing = load_existing()
    seen = {norm(a.get("title", "")) + "|" + (a.get("account", "").strip()) for a in existing}
    collected = []

    # —— 1) 关键词发现 ——
    for q in QUERIES:
        try:
            res = s.search_sogou(q, "article", 1)
        except Exception as e:
            print("search err:", q, e)
            continue
        if not res or "error" in (res[0] if isinstance(res, list) else res):
            print("skip (captcha/no result):", q)
            continue
        for r in res:
            if not isinstance(r, dict):
                continue
            title = clean(r.get("title"))
            account = clean(r.get("account"))
            if not title:
                continue
            digest = clean(r.get("digest"))
            cat = assign_cat(title, digest)
            if not cat:
                continue
            if not useful(title, digest, cat):
                continue
            key = norm(title) + "|" + account
            if key in seen:
                continue
            seen.add(key)
            collected.append(make_entry(title, account, digest, r.get("sogou_link", ""), cat))

    # —— 2) 账号定向跟踪 ——
    now = int(__import__("time").time())
    tf = now - ACCOUNT_RECENT_DAYS * 86400
    for acc_search, cat, disp in ACCOUNTS:
        try:
            res = s.search_sogou(acc_search, "article", 1, tf, now)
        except Exception as e:
            print("account search err:", acc_search, e)
            continue
        if not res or "error" in (res[0] if isinstance(res, list) else res):
            print("skip account (captcha/no result):", acc_search)
            continue
        added_here = 0
        for r in res:
            if not isinstance(r, dict):
                continue
            title = clean(r.get("title"))
            account = clean(r.get("account"))
            if not title or not account:
                continue
            # 只保留该账号自己的推文
            if not fuzzy(account, acc_search):
                continue
            digest = clean(r.get("digest"))
            if not useful(title, digest, cat):
                continue
            key = norm(title) + "|" + account
            if key in seen:
                continue
            seen.add(key)
            e = make_entry(title, account, digest, r.get("sogou_link", ""), cat, tracked=True, source=disp)
            collected.append(e)
            added_here += 1
        print("account [%s] -> +%d" % (disp, added_here))

    if collected:
        existing.extend(collected)
        print("新增 %d 篇：" % len(collected))
        for a in collected:
            print("  + [%s%s] %s | %s" % (a["cat"], "★" if a["tracked"] else "", a["title"][:38], a["account"]))
    else:
        print("无新文章")

    # 按日期倒序（新→旧），空日期置后
    existing.sort(key=lambda a: a.get("date", "") or "0000", reverse=True)

    # 导出 window.SOURCES（被跟踪账号的最新日期 + 篇数）
    sources = []
    for acc_search, cat, disp in ACCOUNTS:
        matched = [a for a in existing if fuzzy(a.get("account", ""), acc_search)]
        if matched:
            latest = max((a.get("date", "") for a in matched), default="")
            accs = sorted(set(a.get("account", "") for a in matched if a.get("account")))
            sources.append({"name": disp, "cat": cat, "count": len(matched),
                            "latest": latest, "accounts": accs})
    sources.sort(key=lambda x: (x["cat"], x["latest"]), reverse=True)

    # 自愈式重算 region（保证下次抓取不被冲掉；标题稳定，结果与手动标记一致）
    for a in existing:
        a["region"] = region_for(a.get("title", ""), a.get("cat", ""))

    out = "window.ARTICLES = " + json.dumps(existing, ensure_ascii=False, indent=1) + ";\n"
    out += 'window.ARTICLES_UPDATED = "%s";\n' % datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    out += "window.SOURCES = " + json.dumps(sources, ensure_ascii=False, indent=1) + ";\n"
    open(OUT, "w", encoding="utf-8").write(out)

    ka = sum(1 for a in existing if a.get("cat") == "考证")
    kb = sum(1 for a in existing if a.get("cat") == "考博")
    tr = sum(1 for a in existing if a.get("tracked"))
    print("已写入", OUT, "共", len(existing), "篇（考证 %d / 考博 %d，其中定向跟踪 %d 篇）" % (ka, kb, tr))
    print("关注源 %d 个（考证 %d / 考博 %d）" % (
        len(sources), sum(1 for x in sources if x["cat"] == "考证"), sum(1 for x in sources if x["cat"] == "考博")))

if __name__ == "__main__":
    main()

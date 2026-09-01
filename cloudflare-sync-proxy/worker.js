/**
 * Cloudflare Worker 版云同步存储（终极方案）
 *
 * 背景：CloudBase（腾讯云）账户欠费导致 PostgreSQL 数据库实例冻结（实测
 * `create pg connection ... failed to connect to postgres`），旧「转发到
 * CloudBase 网关」方案不可行。本 Worker 改为**直接把数据存在 Cloudflare KV**，
 * 免费额度（每天 10 万读 / 1000 写）对个人打卡数据绰绰有余，永不欠费、永不过期。
 *
 * 数据模型（与旧 CloudBase user_data 表语义兼容）：
 *   - KV key  = "user_data:" + localStorage key
 *   - KV value = JSON.stringify({ key, value, updated_at })
 *   - select 返回数组 [{ key, value, updated_at }, ...]（value 为任意 JSON）
 *
 * 路径映射（前端 index.html 的 cloud 对象原样可用，只改 SYNC_PROXY_URL）：
 *   - GET    /v1/rdb/rest/user_data?select=key,value   → 列出全部
 *   - POST   /v1/rdb/rest/user_data                     → upsert（body: [rows]）
 *   - DELETE /v1/rdb/rest/user_data?key=eq.<key>        → 删除单条
 *   - POST   /auth/v1/signin/anonymously                → 返回假 token（兼容旧登录调用）
 *   - OPTIONS → CORS 预检
 *
 * 部署：
 *   cd cloudflare-sync-proxy
 *   wrangler deploy                       # 需先 wrangler login
 *   （KV namespace 已建：learningdesktop-sync）
 *   然后把 index.html 的 SYNC_PROXY_URL 改为 https://learningdesktop-sync-proxy.354341337.workers.dev
 */

const KV_PREFIX = "user_data:";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: CORS_HEADERS });
    }

    // 兼容旧登录调用：返回一个假 token（KV 模式无需真实鉴权）
    if (path.includes("/auth/v1/signin/anonymously")) {
      return json(200, { access_token: "kv-mode-anon", token_type: "bearer", expires_in: 3600 });
    }

    // 兼容可选前缀：/syncProxy、/api（防御性剥离）
    let p = path;
    for (const prefix of ["/syncProxy", "/api"]) {
      if (p === prefix || p.startsWith(prefix + "/")) { p = p.slice(prefix.length); break; }
    }
    if (!p.startsWith("/")) p = "/" + p;

    // 仅处理 user_data 表，其余返回 404
    const m = p.match(/^\/v1\/rdb\/rest\/user_data$/);
    if (!m) {
      return json(404, { error: "not found", path: p });
    }

    const kv = env.SYNC_KV;
    if (!kv) {
      return json(500, { error: "SYNC_KV binding 未配置（wrangler.toml 缺 kv_namespaces）" });
    }

    try {
      if (request.method === "GET") {
        // 列出全部
        const rows = [];
        const listed = await kv.list({ prefix: KV_PREFIX });
        for (const item of listed.keys) {
          const raw = await kv.get(item.name);
          if (!raw) continue;
          try {
            rows.push(JSON.parse(raw));
          } catch (e) {
            rows.push({ key: item.name.slice(KV_PREFIX.length), value: raw, updated_at: null });
          }
        }
        // 按 updated_at 排序（稳定输出）
        rows.sort((a, b) => String(a.updated_at || "").localeCompare(String(b.updated_at || "")));
        return json(200, rows);
      }

      if (request.method === "POST") {
        // upsert：body = [ {key, value, updated_at}, ... ]
        const bodyText = await request.text();
        let rows;
        try { rows = JSON.parse(bodyText || "[]"); } catch (e) { return json(400, { error: "invalid JSON body" }); }
        if (!Array.isArray(rows)) rows = [rows];
        for (const row of rows) {
          if (!row || typeof row.key !== "string") continue;
          const rec = {
            key: row.key,
            value: row.value ?? null,
            updated_at: row.updated_at || new Date().toISOString(),
          };
          await kv.put(KV_PREFIX + row.key, JSON.stringify(rec));
        }
        return json(201, { success: true, count: rows.filter(r => r && typeof r.key === "string").length });
      }

      if (request.method === "DELETE") {
        // key=eq.<key>
        const keyParam = url.searchParams.get("key");
        if (!keyParam) return json(400, { error: "missing ?key=eq.<key>" });
        const k = keyParam.startsWith("eq.") ? keyParam.slice(3) : keyParam;
        await kv.delete(KV_PREFIX + k);
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      return json(405, { error: "method not allowed" });
    } catch (err) {
      return json(500, { error: String(err && err.message || err), proxy: "cloudflare-worker-kv" });
    }
  },
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS),
  });
}

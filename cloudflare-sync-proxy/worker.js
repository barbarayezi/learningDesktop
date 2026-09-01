/**
 * Cloudflare Worker 版同步代理（免费替代 CloudBase 云函数）
 *
 * 作用：浏览器 → https://<worker>.workers.dev/* → 本 Worker → CloudBase PostgreSQL (PostgREST) 网关
 *       在服务端统一注入 service_role 密钥，解决浏览器跨域与「密钥不能进前端」的问题。
 *
 * 部署：
 *   1) 把本文件与 wrangler.toml 放到任意目录，cd 进去
 *   2) wrangler login && wrangler deploy
 *   3) 设置密钥（二选一）：
 *        - wrangler secret put CLOUDBASE_SERVICE_KEY
 *        - 或 Dashboard → 你的 Worker → Settings → Variables → 添加(Secret) CLOUDBASE_SERVICE_KEY
 *      密钥值：CloudBase 控制台「数据管理 → 鉴权设置/API Keys」重新生成的 service_role 密钥
 *   4) 部署后把 index.html 里 SYNC_PROXY_URL 改成 https://<worker名>.<你的子域>.workers.dev
 *
 * 兼容路径：/syncProxy/api/...、/api/...、/v1/rdb/rest/...、/auth/v1/... 均可（自动剥离可选前缀）。
 */

const CLOUDBASE_URL = "https://test-d5gf0o9ky7d34beaf.api.tcloudbasegateway.com";

// 可选的触发前缀（兼容旧云函数路径），如无前缀则原样转发
const STRIP_PREFIXES = ["/syncProxy", "/api"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request, env) {
    const serviceKey = env.CLOUDBASE_SERVICE_KEY;
    if (!serviceKey) {
      return json(500, { error: "CLOUDBASE_SERVICE_KEY 未配置，请在 Cloudflare Worker 环境变量(Secret)中设置" });
    }

    const url = new URL(request.url);

    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response("", { status: 204, headers: CORS_HEADERS });
    }

    // 循环剥掉可选前缀（/syncProxy、/api），直到无可剥，拼回 query string。
    // 兼容三种调用形态：https://worker/v1/rdb/rest/...（无前缀）、
    // https://worker/syncProxy/v1/rdb/rest/...（旧云函数单前缀）、
    // https://worker/syncProxy/api/v1/rdb/rest/...（双前缀残留，防御性）。
    let targetPath = url.pathname;
    let stripped = true;
    while (stripped) {
      stripped = false;
      for (const prefix of STRIP_PREFIXES) {
        if (targetPath === prefix || targetPath.startsWith(prefix + "/")) {
          targetPath = targetPath.slice(prefix.length);
          stripped = true;
          break;
        }
      }
    }
    if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;
    targetPath += url.search;

    // 透传请求头，但剔除会被网关拒绝/冲突的头，并注入 service_role 密钥
    const headers = new Headers(request.headers);
    for (const h of ["host", "origin", "referer", "connection", "accept-encoding", "authorization", "apikey"]) {
      headers.delete(h);
    }
    headers.set("apikey", serviceKey);
    headers.set("Authorization", "Bearer " + serviceKey);

    let resp;
    try {
      resp = await fetch(CLOUDBASE_URL + targetPath, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });
    } catch (err) {
      return json(502, { error: String(err && err.message || err), proxy: "cloudflare-worker" });
    }

    // 组装响应：透传业务头 + 强制 CORS；fetch 在 Worker 内已自动解压 gzip，需去掉 content-encoding 防浏览器二次解压
    const outHeaders = new Headers(resp.headers);
    for (const h of ["content-encoding", "transfer-encoding", "connection"]) {
      outHeaders.delete(h);
    }
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      outHeaders.set(k, v);
    }
    return new Response(resp.body, { status: resp.status, headers: outHeaders });
  },
};

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS),
  });
}

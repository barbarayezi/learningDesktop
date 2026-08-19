/**
 * CloudBase 云函数版同步代理
 * 作用：把浏览器对 /api/* 的请求转发到 CloudBase PostgreSQL (PostgREST) 网关，
 *       并在服务端统一注入 service_role 密钥，解决浏览器跨域与匿名登录问题。
 *
 * 部署后，把 index.html 里的 SYNC_PROXY_URL 改成云函数访问地址即可：
 *   var SYNC_PROXY_URL = "https://<你的云函数域名>/syncProxy";
 *
 * 安全提醒：service_role 是项目级超级密钥，拥有绕过 RLS 的全部权限。
 *          建议通过 CloudBase 控制台「层管理 / 环境变量」注入 CLOUDBASE_SERVICE_KEY，
 *          不要把密钥提交到公开仓库。
 */

const CLOUDBASE_URL = "https://test-d5gf0o9ky7d34beaf.api.tcloudbasegateway.com";
const CLOUDBASE_KEY = process.env.CLOUDBASE_SERVICE_KEY;
if (!CLOUDBASE_KEY) {
  throw new Error("环境变量 CLOUDBASE_SERVICE_KEY 未设置，云函数无法启动。请在 CloudBase 控制台「层管理 / 环境变量」中注入 service_role 密钥。");
}
const API_PREFIX = "/api";

function getTargetUrl(event) {
  // CloudBase 网关会把完整路径（含 query）放在 event.path 或 event.rawPath
  let rawPath = event.path || event.rawPath || "/";

  // 有的网关会把 query string 拆出来，需要拼回去
  // CloudBase HTTP 网关可能传成字符串（event.queryString）或对象（event.queryStringParameters）
  const qs = event.queryString || event.queryStringParameters;
  if (qs) {
    let searchStr = "";
    if (typeof qs === "string") {
      searchStr = qs;
    } else if (typeof qs === "object" && Object.keys(qs).length > 0) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(qs)) {
        if (Array.isArray(v)) {
          v.forEach((item) => search.append(k, item));
        } else if (v !== undefined && v !== null) {
          search.append(k, v);
        }
      }
      searchStr = search.toString();
    }
    if (searchStr && !rawPath.includes("?")) {
      rawPath = rawPath + "?" + searchStr;
    }
  }

  // 1) 去掉云函数触发前缀（HTTP 访问服务里配的触发路径，默认 /syncProxy）
  //    浏览器访问 https://<域名>/syncProxy/api/...，网关透传后 event.path = /syncProxy/api/...
  let targetPath = rawPath;
  const TRIGGER_PREFIX = process.env.TRIGGER_PREFIX || "/syncProxy";
  if (targetPath.startsWith(TRIGGER_PREFIX)) {
    targetPath = targetPath.slice(TRIGGER_PREFIX.length);
  }
  // 2) 去掉 /api 前缀（兼容本地同源模式 origin+"/api" 直接打云函数的场景）
  if (targetPath.startsWith(API_PREFIX)) {
    targetPath = targetPath.slice(API_PREFIX.length);
  }
  if (!targetPath.startsWith("/")) targetPath = "/" + targetPath;

  return CLOUDBASE_URL + targetPath;
}

function buildHeaders(event) {
  const headers = {};
  const incoming = event.headers || {};

  for (const [k, v] of Object.entries(incoming)) {
    const lower = k.toLowerCase();
    // 以下头由代理重新设置或不应透传
    if (["host", "referer", "origin", "connection", "accept-encoding", "authorization", "apikey"].includes(lower)) {
      continue;
    }
    headers[k] = v;
  }

  // 注入 service_role 密钥：这是云端鉴权的关键
  headers["apikey"] = CLOUDBASE_KEY;
  headers["Authorization"] = "Bearer " + CLOUDBASE_KEY;

  return headers;
}

function getBody(event) {
  if (!event.body) return undefined;
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, "base64");
  }
  return Buffer.from(event.body);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

exports.main = async (event, context) => {
  // 处理 CORS 预检
  if ((event.httpMethod || event.method) === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(),
      body: "",
    };
  }

  const method = (event.httpMethod || event.method || "GET").toUpperCase();
  const url = getTargetUrl(event);
  const headers = buildHeaders(event);
  const body = getBody(event);

  try {
    const fetch = require("node-fetch");
    const res = await fetch(url, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method) ? undefined : body,
      timeout: 30000,
    });

    const resBody = await res.buffer();
    const resHeaders = {};
    res.headers.forEach((v, k) => {
      // 这些头不应该由云函数返回，避免冲突
      if (["content-encoding", "transfer-encoding", "connection"].includes(k.toLowerCase())) return;
      resHeaders[k] = v;
    });

    return {
      statusCode: res.status,
      headers: Object.assign({}, corsHeaders(), resHeaders),
      body: resBody.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: Object.assign({}, corsHeaders(), { "Content-Type": "application/json" }),
      body: JSON.stringify({ error: err.message, proxy: "cloudbase-sync-proxy" }),
    };
  }
};

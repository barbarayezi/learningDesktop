#!/usr/bin/env python3
"""
HTTP 服务器 + CloudBase API 代理
解决免费版 CloudBase 不支持自定义 CORS 域名的问题：
  浏览器 → 同源 /api/* → Python 代理 → CloudBase PostgreSQL API
"""

import http.server
import urllib.request
import urllib.error
import json
import os
import sys

PORT = 8080
BIND = "0.0.0.0"

# CloudBase PostgreSQL (Supabase-compatible) API
CLOUDBASE_URL = "https://test-d5gf0o9ky7d34beaf.api.tcloudbasegateway.com"
CLOUDBASE_KEY = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImY1YmNlNmNhLTUzN2ItNGE0Yy04Yzc3LThhYWYwYTdiNjVhYSJ9.eyJhdWQiOiJ0ZXN0LWQ1Z2YwbzlreTdkMzRiZWFmIiwiZXhwIjoyNTM0MDIzMDA3OTksImlhdCI6MTc4NzAxNjQxOSwiYXRfaGFzaCI6IlhVYWhZWVZSU2xDZjJEV19jTVRrNkEiLCJwcm9qZWN0X2lkIjoidGVzdC1kNWdmMG85a3k3ZDM0YmVhZiIsIm1ldGEiOnsicGxhdGZvcm0iOiJBcGlLZXkifSwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImFwaWtleSIsInByb3ZpZGVycyI6WyJhcGlrZXkiXX0sImFkbWluaXN0cmF0b3JfaWQiOiIyMDg4ODA5ODc5MDg2MDM5MDQwIiwidXNlcl90eXBlIjoiIiwiY2xpZW50X3R5cGUiOiJjbGllbnRfc2VydmVyIiwiaXNfc3lzdGVtX2FkbWluIjp0cnVlfQ.tJ-wbUZEfFob1pb7W8b85bnA6cbjVRhkx5DHkrCFhXc7zBlEfx61OjGCTStS5P26sd0N_Y-wwlwSJzsuhPn46Kryd3Hh9rJ-XP_IZ979db3DObOZJiVdSGygbuqCOLCxj7X5codLUPmgM7SY2z8-84-hTN_6Lx_GYeM-rmug7ROzGZLaYgl2mYtp_0Exi2uYiTmY6IiaCN42GimaRpd5X9y3lX5Xh6ph_iffmTDxqukxRTGhjtH9Jqtfnpvxe6czDtt554yhIqh7ZBtBVsnpeXt6TsrwFUHm5JQuygBtKE624hiqFZg8qcLUgGNR4Lh-PFv_QZgfSRdEc3uWKHtDqg"

API_PREFIX = "/api/"


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    """Static file server + API reverse proxy."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.dirname(os.path.abspath(__file__)), **kwargs)

    def do_GET(self):
        if self.path.startswith(API_PREFIX):
            self.proxy_request("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith(API_PREFIX):
            self.proxy_request("POST")
        else:
            self.send_error(405, "Method Not Allowed")

    def do_PATCH(self):
        if self.path.startswith(API_PREFIX):
            self.proxy_request("PATCH")
        else:
            self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):
        if self.path.startswith(API_PREFIX):
            self.proxy_request("DELETE")
        else:
            self.send_error(405, "Method Not Allowed")

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def proxy_request(self, method):
        """Forward request to CloudBase API."""
        target_path = self.path[len(API_PREFIX):]  # strip /api/ prefix, includes query string
        target_url = f"{CLOUDBASE_URL}/{target_path}"

        # Read request body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        # Prepare headers to forward from original request
        forward_headers = {}
        # Forward relevant headers from the browser
        for h in self.headers:
            hl = h.lower()
            if hl in ("host", "referer", "origin", "connection", "accept-encoding",
                      "authorization", "apikey"):
                continue
            forward_headers[h] = self.headers[h]
        # 注入 service_role 密钥：CloudBase 网关用 apikey / Authorization 识别项目并鉴权。
        # 浏览器不持有此密钥，所有云端请求统一由本服务端代理鉴权（service_role 绕过 RLS）。
        forward_headers["apikey"] = CLOUDBASE_KEY
        forward_headers["Authorization"] = "Bearer " + CLOUDBASE_KEY

        req = urllib.request.Request(
            target_url,
            data=body,
            headers=forward_headers,
            method=method,
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                response_body = resp.read()
                self.send_response(resp.status)
                self._send_cors_headers()
                # Forward response headers
                content_type = resp.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(response_body)))
                self.end_headers()
                self.wfile.write(response_body)
        except urllib.error.HTTPError as e:
            error_body = e.read()
            self.send_response(e.code)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(error_body)))
            self.end_headers()
            self.wfile.write(error_body)
        except Exception as e:
            self.send_response(502)
            self._send_cors_headers()
            self.send_header("Content-Type", "application/json")
            error_msg = json.dumps({"error": str(e)}).encode()
            self.send_header("Content-Length", str(len(error_msg)))
            self.end_headers()
            self.wfile.write(error_msg)

    def _send_cors_headers(self):
        """Allow all origins (since this is a local proxy)."""
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")

    def log_message(self, format, *args):
        """Custom log format with proxy marker."""
        if args[0].startswith("api/"):
            sys.stdout.write("[proxy] %s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))
        else:
            sys.stdout.write("[static] %s - - [%s] %s\n" % (self.client_address[0], self.log_date_time_string(), format % args))


if __name__ == "__main__":
    server = http.server.HTTPServer((BIND, PORT), ProxyHandler)
    print(f"Proxy server started: http://0.0.0.0:{PORT}/")
    print(f"   API proxy: /api/* -> {CLOUDBASE_URL}/*")
    print(f"   Static files: {os.path.dirname(os.path.abspath(__file__))}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务器已停止")
        server.server_close()
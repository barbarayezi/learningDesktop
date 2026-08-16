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
CLOUDBASE_KEY = "eyJhbGciOiJSUzI1NiIsImtpZCI6IjA5NTU2YzJiLTcxODctNDM3Yi1iNjg1LTVmYjdhNWU2MDQ0NyJ9.eyJpc3MiOiJodHRwczovL3Rlc3QtZDVnZjBvOWt5N2QzNGJlYWYuYXAtc2hhbmdoYWkudGNiLmFwaS50ZW5jZW50Y2xvdWRhcGkuY29tL2F1dGgvdjEvNzE0MjYyMjIxNjkwMjUyNDg3IiwiYXBpS2V5SWQiOiI3MTQyNjIyMjE2OTAyNTI0ODciLCJpYXQiOjE3NTUzMDI0MDAsImV4cCI6MTc1NTMwNjAwMCwiYXVkIjoiL3Jlc3QvdjEvIiwic3ViIjoiNzE0MjYyMjIxNjkwMjUyNDg3In0.Eao0k5fXqnhq56qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qJqGb8qG8qCg"

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
            if hl in ("host", "referer", "origin", "connection", "accept-encoding"):
                continue
            forward_headers[h] = self.headers[h]

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
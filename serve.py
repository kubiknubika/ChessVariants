#!/usr/bin/env python3
"""Статический сервер без кеширования (чтобы всегда отдавалась свежая версия)."""
import http.server
import functools


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


if __name__ == '__main__':
    handler = functools.partial(NoCacheHandler, directory='.')
    server = http.server.ThreadingHTTPServer(('0.0.0.0', 8000), handler)
    print('Serving on 0.0.0.0:8000 (no-store)')
    server.serve_forever()

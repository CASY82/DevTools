#!/usr/bin/env python3
"""GameDev Hub 로컬 정적 서버 (의존성 없음).

앱 루트(이 파일의 상위 폴더)를 그대로 서빙한다. ES 모듈은 file:// 로 열리지 않으므로
로컬 확인은 항상 이 서버를 통한다. 배포에는 관여하지 않는다.

    python3 _local/serve.py [포트] [호스트]   # 기본 8080, 0.0.0.0
      → 앱      http://localhost:8080/
      → 미리보기 http://localhost:8080/_local/preview.html

WSL에서 Windows 브라우저로 접속하려면 0.0.0.0 바인딩이 필요하다(127.0.0.1 은 Windows에서 안 보임).
같은 네트워크의 다른 기기에도 노출되므로, 단독 사용 시에는 호스트를 127.0.0.1 로 지정한다.
"""
import http.server
import os
import socket
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
HOST = sys.argv[2] if len(sys.argv) > 2 else '0.0.0.0'


class Handler(http.server.SimpleHTTPRequestHandler):
    """캐시를 끄고(수정 즉시 반영) 모듈 MIME 타입을 보장한다."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, fmt, *args):
        if '"GET' in (fmt % args) and ' 200 ' not in (fmt % args):
            sys.stderr.write('  %s\n' % (fmt % args))


def wsl_hint(port):
    """WSL에서는 Windows 브라우저가 localhost로 접속하지 못할 수 있어 실제 IP를 함께 안내한다."""
    try:
        with open('/proc/version', encoding='utf-8') as fh:
            if 'microsoft' not in fh.read().lower():
                return None
        probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        probe.connect(('10.255.255.255', 1))
        ip = probe.getsockname()[0]
        probe.close()
        return f'WSL 감지 · Windows 브라우저에서 localhost가 안 되면 → http://{ip}:{port}/'
    except OSError:
        return None


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == '__main__':
    with Server((HOST, PORT), Handler) as httpd:
        print(f'GameDev Hub  →  http://localhost:{PORT}/', flush=True)
        print(f'화면 미리보기 →  http://localhost:{PORT}/_local/preview.html', flush=True)
        hint = wsl_hint(PORT)
        if hint:
            print(hint, flush=True)
        print(f'바인딩 {HOST}:{PORT} · 종료: Ctrl+C', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n중지했습니다.')

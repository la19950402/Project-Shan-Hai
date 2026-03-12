import http.server
import socketserver
import webbrowser
from pathlib import Path

PORT = 5500
ROOT = Path(__file__).resolve().parent

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

if __name__ == '__main__':
    url = f'http://127.0.0.1:{PORT}/index.html'
    print(f'Serving {ROOT} at {url}')
    try:
        webbrowser.open(url)
    except Exception:
        pass
    with socketserver.TCPServer(('127.0.0.1', PORT), Handler) as httpd:
        httpd.serve_forever()

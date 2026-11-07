# Runs the site on your laptop at http://localhost:8000 (start-editor uses this).
# Same as "python -m http.server", except it tells the browser never to keep old copies,
# so after you Pull new changes you always see the newest version straight away.
import http.server, socketserver, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('', port), NoCache) as s:
    print(f'Site running at http://localhost:{port}  (close this window to stop it)')
    s.serve_forever()

import http.server
import socketserver
import json
import os

PORT = 8000
DB_FILE = 'data/db.json'

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/last-modified':
            try:
                if os.path.exists(DB_FILE):
                    mtime = os.path.getmtime(DB_FILE)
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"last_modified": mtime}).encode('utf-8'))
                else:
                    self.send_error(404, "Database file not found")
            except Exception as e:
                self.send_error(500, str(e))
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/save':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                category = payload.get('category')
                new_item = payload.get('item')

                if not category or not new_item:
                    self.send_error(400, "Missing category or item")
                    return

                # Read existing data
                if os.path.exists(DB_FILE):
                    with open(DB_FILE, 'r', encoding='utf-8') as f:
                        db_data = json.load(f)
                else:
                    db_data = {"chiefMessages": [], "amicalistMessages": [], "recruits": [], "events": []}

                # Append new item
                if category in db_data:
                    db_data[category].append(new_item)
                    
                    # Write back to file
                    with open(DB_FILE, 'w', encoding='utf-8') as f:
                        json.dump(db_data, f, indent=2, ensure_ascii=False)
                    
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                else:
                    self.send_error(400, f"Invalid category: {category}")

            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
            except Exception as e:
                self.send_error(500, str(e))
        else:
            self.send_error(404, "Not Found")

print(f"Serving at http://localhost:{PORT}")
print("Press Ctrl+C to stop")

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

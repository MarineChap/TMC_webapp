import http.server
import socketserver
import json
import os
import socket
import threading
from urllib.parse import urlparse

PORT = int(os.environ.get('PORT', 8000))
DB_FILE = 'data/db.json'
file_lock = threading.Lock()

def get_local_ip():
    try:
        # Connect to an external server (doesn't actually send data) to get the local interface IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path == '/api/last-modified':
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
        elif path == '/api/ip':
            try:
                ip = get_local_ip()
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"ip": ip, "port": PORT}).encode('utf-8'))
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

                with file_lock:
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
        elif self.path == '/api/delete':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                category = payload.get('category')
                item_to_delete = payload.get('item')

                if not category or not item_to_delete:
                    self.send_error(400, "Missing category or item")
                    return

                with file_lock:
                    if os.path.exists(DB_FILE):
                        with open(DB_FILE, 'r', encoding='utf-8') as f:
                            db_data = json.load(f)
                    else:
                        self.send_error(404, "Database not found")
                        return

                    if category in db_data:
                        # Find and remove the item (matching by content)
                        original_len = len(db_data[category])
                        # Filter out the item that matches item_to_delete
                        # We use a list comprehension to keep items that are NOT equal to item_to_delete
                        # Note: This removes ALL exact duplicates if they exist, which is usually desired behavior for "delete this content"
                        # If we wanted to remove only one, we'd need to iterate and remove the first match.
                        # Let's remove only the first match to be safe.
                        if item_to_delete in db_data[category]:
                            db_data[category].remove(item_to_delete)
                            
                            with open(DB_FILE, 'w', encoding='utf-8') as f:
                                json.dump(db_data, f, indent=2, ensure_ascii=False)
                            
                            self.send_response(200)
                            self.send_header('Content-type', 'application/json')
                            self.end_headers()
                            self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
                        else:
                            self.send_error(404, "Item not found")
                    else:
                        self.send_error(400, f"Invalid category: {category}")

            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
            except Exception as e:
                self.send_error(500, str(e))
        else:
            self.send_error(404, "Not Found")

print(f"Serving at http://localhost:{PORT}")
print(f"Local Network URL: http://{get_local_ip()}:{PORT}")
print("Press Ctrl+C to stop")

class ThreadingSimpleServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    pass

with ThreadingSimpleServer(("", PORT), CustomHandler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass

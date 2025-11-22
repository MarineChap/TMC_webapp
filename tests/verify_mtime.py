import requests
import time
import os

URL = "http://localhost:8000/api/last-modified"
DB_FILE = "data/db.json"

def get_mtime():
    try:
        return requests.get(URL).json()['last_modified']
    except Exception as e:
        print(f"Error: {e}")
        return None

print("Initial check...")
t1 = get_mtime()
print(f"T1: {t1}")

print("Touching db.json...")
# Read and write back to force mtime update
if os.path.exists(DB_FILE):
    with open(DB_FILE, 'r+') as f:
        content = f.read()
        f.seek(0)
        f.write(content)
        f.truncate()
        os.fsync(f.fileno()) # Force write to disk

time.sleep(1)

print("Second check...")
t2 = get_mtime()
print(f"T2: {t2}")

if t1 != t2:
    print("SUCCESS: Timestamp changed.")
else:
    print("FAILURE: Timestamp did not change.")

import requests
import time
import threading
import json

URL_POLL = "http://localhost:8000/api/last-modified"
URL_SAVE = "http://localhost:8000/api/save"

def poller():
    last_mtime = 0
    print("Poller started.")
    for _ in range(10):
        try:
            r = requests.get(URL_POLL)
            mtime = r.json()['last_modified']
            if last_mtime != 0 and mtime != last_mtime:
                print(f"POLLER: Detected change! Old: {last_mtime}, New: {mtime}")
            last_mtime = mtime
        except Exception as e:
            print(f"POLLER Error: {e}")
        time.sleep(0.5)

def modifier():
    time.sleep(2)
    print("Modifier: Sending update...")
    payload = {
        "category": "events",
        "item": {
            "date": "Test Date",
            "title": "Test Event",
            "description": "Test Description"
        }
    }
    try:
        requests.post(URL_SAVE, json=payload)
        print("Modifier: Update sent.")
    except Exception as e:
        print(f"Modifier Error: {e}")

t = threading.Thread(target=poller)
t.start()

modifier()

t.join()
print("Test finished.")

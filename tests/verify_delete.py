import requests
import json

URL_SAVE = "http://localhost:8000/api/save"
URL_DELETE = "http://localhost:8000/api/delete"
URL_DB = "http://localhost:8000/data/db.json"

# 1. Add an item
print("Adding item...")
item = {
    "date": "Delete Test Date",
    "title": "Delete Test Event",
    "description": "Delete Test Description"
}
payload = {
    "category": "events",
    "item": item
}
requests.post(URL_SAVE, json=payload)

# 2. Verify it exists
print("Verifying addition...")
db = requests.get(URL_DB).json()
if item in db['events']:
    print("Item added successfully.")
else:
    print("Failed to add item.")
    exit(1)

# 3. Delete the item
print("Deleting item...")
requests.post(URL_DELETE, json=payload)

# 4. Verify it is gone
print("Verifying deletion...")
db = requests.get(URL_DB).json()
if item not in db['events']:
    print("SUCCESS: Item deleted.")
else:
    print("FAILURE: Item still exists.")

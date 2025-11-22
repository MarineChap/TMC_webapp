import unittest
import subprocess
import time
import requests
import os
import json
import shutil
import signal

# Configuration
TEST_PORT = 8001
BASE_URL = f"http://localhost:{TEST_PORT}"
DB_FILE = 'data/db.json'
BACKUP_FILE = 'data/db.json.bak'

class TestServerIntegration(unittest.TestCase):
    server_process = None

    @classmethod
    def setUpClass(cls):
        """Start the server in a subprocess before running tests."""
        print(f"Starting test server on port {TEST_PORT}...")
        
        # Backup db.json if it exists
        if os.path.exists(DB_FILE):
            shutil.copy2(DB_FILE, BACKUP_FILE)
        
        # Start server with custom port
        env = os.environ.copy()
        env['PORT'] = str(TEST_PORT)
        cls.server_process = subprocess.Popen(
            ['python', 'server.py'],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        # Wait for server to start
        time.sleep(2)
        
        # Verify server is running
        if cls.server_process.poll() is not None:
            raise RuntimeError("Server failed to start")

    @classmethod
    def tearDownClass(cls):
        """Stop the server and restore the database after tests."""
        print("Stopping test server...")
        if cls.server_process:
            cls.server_process.terminate()
            cls.server_process.wait()
        
        # Restore backup
        if os.path.exists(BACKUP_FILE):
            shutil.move(BACKUP_FILE, DB_FILE)
        elif os.path.exists(DB_FILE):
            # If no backup existed (clean state), remove the created db
            os.remove(DB_FILE)

    def test_01_get_ip(self):
        """Test /api/ip endpoint."""
        response = requests.get(f"{BASE_URL}/api/ip")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn('ip', data)
        self.assertEqual(data['port'], TEST_PORT)

    def test_02_last_modified(self):
        """Test /api/last-modified endpoint."""
        response = requests.get(f"{BASE_URL}/api/last-modified")
        # It might return 404 if db doesn't exist yet, or 200 if it does
        if response.status_code == 200:
            self.assertIn('last_modified', response.json())
        elif response.status_code == 404:
            pass # Acceptable if DB not created yet
        else:
            self.fail(f"Unexpected status code: {response.status_code}")

    def test_03_save_item(self):
        """Test /api/save endpoint."""
        payload = {
            "category": "events",
            "item": {
                "date": "Test Date",
                "title": "Integration Test Event",
                "description": "Created by automated test"
            }
        }
        response = requests.post(f"{BASE_URL}/api/save", json=payload)
        self.assertEqual(response.status_code, 200)
        
        # Verify it's in the DB
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            found = False
            for item in data['events']:
                if item['title'] == "Integration Test Event":
                    found = True
                    break
            self.assertTrue(found, "Saved item not found in DB")

    def test_04_last_modified_updates(self):
        """Test that last-modified updates after save."""
        # Get initial time
        r1 = requests.get(f"{BASE_URL}/api/last-modified")
        t1 = r1.json()['last_modified']
        
        # Save another item
        payload = {
            "category": "events",
            "item": {
                "date": "Test Date 2",
                "title": "Integration Test Event 2",
                "description": "Created by automated test"
            }
        }
        requests.post(f"{BASE_URL}/api/save", json=payload)
        
        # Get new time
        r2 = requests.get(f"{BASE_URL}/api/last-modified")
        t2 = r2.json()['last_modified']
        
        self.assertNotEqual(t1, t2, "Timestamp should have changed")

    def test_05_delete_item(self):
        """Test /api/delete endpoint."""
        item_to_delete = {
            "date": "Test Date",
            "title": "Integration Test Event",
            "description": "Created by automated test"
        }
        payload = {
            "category": "events",
            "item": item_to_delete
        }
        
        response = requests.post(f"{BASE_URL}/api/delete", json=payload)
        self.assertEqual(response.status_code, 200)
        
        # Verify it's gone
        with open(DB_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            found = False
            for item in data['events']:
                if item['title'] == "Integration Test Event":
                    found = True
                    break
            self.assertFalse(found, "Deleted item still found in DB")

if __name__ == '__main__':
    unittest.main()

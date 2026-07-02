"""
HERCO360 Backend API Test Suite
Tests all endpoints with real JWT auth and MongoDB
"""
import requests
import sys
from datetime import datetime, timedelta

BASE_URL = "https://herco-corporate.preview.emergentagent.com/api"

class HERCO360Tester:
    def __init__(self):
        self.base_url = BASE_URL
        self.admin_token = None
        self.user_token = None
        self.new_user_token = None
        self.walter_token = None  # Tienda user (HAS inventory access)
        self.samuel_token = None  # Negocios País user (NO inventory access)
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []
        
        # Test data storage
        self.new_user_id = None
        self.new_user_email = None
        self.activity_id = None
        self.reservation_id = None
        self.notification_id = None
        self.test_article = None

    def log(self, message, level="INFO"):
        """Log test messages"""
        prefix = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️"
        }.get(level, "ℹ️")
        print(f"{prefix} {message}")

    def test(self, name, method, endpoint, expected_status, token=None, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        self.log(f"Testing: {name}", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"PASSED - {name} (Status: {response.status_code})", "SUCCESS")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                self.tests_failed += 1
                self.failed_tests.append({
                    'name': name,
                    'expected': expected_status,
                    'got': response.status_code,
                    'endpoint': endpoint,
                    'response': response.text[:200]
                })
                self.log(f"FAILED - {name} (Expected {expected_status}, got {response.status_code})", "FAIL")
                self.log(f"Response: {response.text[:200]}", "WARN")
                return False, {}

        except Exception as e:
            self.tests_failed += 1
            self.failed_tests.append({
                'name': name,
                'expected': expected_status,
                'got': 'Exception',
                'endpoint': endpoint,
                'error': str(e)
            })
            self.log(f"FAILED - {name} (Exception: {str(e)})", "FAIL")
            return False, {}

    # ===== AUTH TESTS =====
    def test_auth_login_admin(self):
        """Test admin login"""
        success, response = self.test(
            "Auth: Admin Login",
            "POST",
            "auth/login",
            200,
            data={"email": "kevin.armas@herco.com", "password": "Herco360!"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            self.log(f"Admin token obtained: {self.admin_token[:20]}...", "SUCCESS")
            return True
        return False

    def test_auth_register_new_user(self):
        """Test new user registration - should auto-approve and return token"""
        timestamp = datetime.now().strftime('%H%M%S')
        self.new_user_email = f"test.user.{timestamp}@herco.com"
        success, response = self.test(
            "Auth: Register New User (auto-approve)",
            "POST",
            "auth/register",
            200,
            data={
                "name": f"Test User {timestamp}",
                "email": self.new_user_email,
                "password": "Herco360!",
                "position": "Coordinador",
                "area": "Caja"
            }
        )
        if success:
            # Verify auto-approve: status should be 'approved' and token should be returned
            if response.get('status') == 'approved' and 'token' in response:
                self.log(f"✓ Auto-approved with token: {self.new_user_email}", "SUCCESS")
                self.new_user_token = response['token']
                return True
            else:
                self.log(f"✗ Registration did not auto-approve or return token", "FAIL")
                return False
        return False

    def test_auth_login_pending_user(self):
        """Test login with pending user (should return 403)"""
        success, response = self.test(
            "Auth: Login Pending User (should fail with 403)",
            "POST",
            "auth/login",
            403,
            data={"email": "roberto.mejia@herco.com", "password": "Herco360!"}
        )
        return success

    def test_auth_me(self):
        """Test get current user"""
        success, response = self.test(
            "Auth: Get Current User (/me)",
            "GET",
            "auth/me",
            200,
            token=self.admin_token
        )
        return success

    # ===== USER TESTS =====
    def test_users_list_all(self):
        """Test list all users"""
        success, response = self.test(
            "Users: List All",
            "GET",
            "users",
            200,
            token=self.admin_token
        )
        return success

    def test_users_list_pending(self):
        """Test list pending users"""
        success, response = self.test(
            "Users: List Pending",
            "GET",
            "users",
            200,
            token=self.admin_token,
            params={"status": "pending"}
        )
        if success and isinstance(response, list):
            # Find our newly registered user or Roberto
            for user in response:
                if user.get('email') == self.new_user_email or user.get('email') == 'roberto.mejia@herco.com':
                    self.new_user_id = user.get('id')
                    self.log(f"Found pending user ID: {self.new_user_id}", "SUCCESS")
                    break
        return success

    def test_users_approve(self):
        """Test approve pending user"""
        if not self.new_user_id:
            self.log("No pending user ID to approve", "WARN")
            return False
        
        success, response = self.test(
            "Users: Approve Pending User",
            "POST",
            f"users/{self.new_user_id}/approve",
            200,
            token=self.admin_token
        )
        return success

    def test_auth_login_approved_user(self):
        """Test login with newly approved user"""
        if not self.new_user_email:
            self.log("No new user email to test login", "WARN")
            return False
            
        success, response = self.test(
            "Auth: Login Approved User",
            "POST",
            "auth/login",
            200,
            data={"email": self.new_user_email, "password": "Herco360!"}
        )
        if success and 'token' in response:
            self.new_user_token = response['token']
            self.log(f"Approved user token obtained", "SUCCESS")
            return True
        return False

    def test_users_reject(self):
        """Test reject pending user (using Roberto if available)"""
        # Get Roberto's ID
        success, response = self.test(
            "Users: Get Roberto for Rejection Test",
            "GET",
            "users",
            200,
            token=self.admin_token,
            params={"status": "pending"}
        )
        
        roberto_id = None
        if success and isinstance(response, list):
            for user in response:
                if user.get('email') == 'roberto.mejia@herco.com':
                    roberto_id = user.get('id')
                    break
        
        if not roberto_id:
            self.log("Roberto not found in pending users (may have been approved)", "WARN")
            return True  # Not a failure, just skip
        
        success, response = self.test(
            "Users: Reject Pending User",
            "POST",
            f"users/{roberto_id}/reject",
            200,
            token=self.admin_token
        )
        return success

    def test_users_change_role(self):
        """Test change user role"""
        # Get Samuel's ID
        success, response = self.test(
            "Users: Get Samuel for Role Change",
            "GET",
            "users",
            200,
            token=self.admin_token
        )
        
        samuel_id = None
        if success and isinstance(response, list):
            for user in response:
                if user.get('email') == 'samuel.gonzalez@herco.com':
                    samuel_id = user.get('id')
                    break
        
        if not samuel_id:
            self.log("Samuel not found", "WARN")
            return False
        
        success, response = self.test(
            "Users: Change Role",
            "PATCH",
            f"users/{samuel_id}/role",
            200,
            token=self.admin_token,
            data={"role": "user"}  # Keep as user
        )
        return success

    def test_users_update_profile(self):
        """Test update own profile"""
        success, response = self.test(
            "Users: Update Own Profile",
            "PATCH",
            "users/me",
            200,
            token=self.admin_token,
            data={"phone": "+503 1234-5678"}
        )
        return success

    # ===== ACTIVITY TESTS =====
    def test_activities_list(self):
        """Test list activities"""
        today = datetime.now().strftime('%Y-%m-%d')
        end = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Activities: List with Date Range",
            "GET",
            "activities",
            200,
            token=self.admin_token,
            params={"start": today, "end": end}
        )
        return success

    def test_activities_create(self):
        """Test create activity with participants"""
        # Get some user IDs for participants
        success, response = self.test(
            "Activities: Get Users for Participants",
            "GET",
            "users",
            200,
            token=self.admin_token
        )
        
        participant_ids = []
        if success and isinstance(response, list):
            for user in response[:2]:  # Get first 2 users
                if user.get('status') == 'approved' and user.get('email') != 'kevin.armas@herco.com':
                    participant_ids.append(user.get('id'))
        
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Activities: Create with Participants",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Test Activity - Backend Test",
                "category": "Reunión",
                "date": tomorrow,
                "start_time": "14:00",
                "end_time": "15:00",
                "description": "Test activity created by backend test suite",
                "location": "Test Location",
                "participant_ids": participant_ids,
                "uses_meeting_room": False
            }
        )
        
        if success and 'id' in response:
            self.activity_id = response['id']
            self.log(f"Activity created with ID: {self.activity_id}", "SUCCESS")
            return True
        return False

    def test_activities_create_with_room(self):
        """Test create activity with meeting room (auto-creates reservation)"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Activities: Create with Meeting Room",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Test Room Activity",
                "category": "Reunión",
                "date": tomorrow,
                "start_time": "16:00",
                "end_time": "17:00",
                "description": "Test activity with room reservation",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": True
            }
        )
        return success

    def test_activities_update(self):
        """Test update activity"""
        if not self.activity_id:
            self.log("No activity ID to update", "WARN")
            return False
        
        success, response = self.test(
            "Activities: Update",
            "PUT",
            f"activities/{self.activity_id}",
            200,
            token=self.admin_token,
            data={
                "title": "Test Activity - UPDATED",
                "category": "Seguimiento",
                "date": (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'),
                "start_time": "14:00",
                "end_time": "15:30",
                "description": "Updated description",
                "location": "Updated Location",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        return success

    def test_activities_respond_accept(self):
        """Test accept participation in activity"""
        # First, create an activity with the new user as participant
        if not self.new_user_token:
            self.log("No new user token for respond test", "WARN")
            return True  # Skip
        
        # Get new user ID
        success, response = self.test(
            "Activities: Get New User ID",
            "GET",
            "auth/me",
            200,
            token=self.new_user_token
        )
        
        new_user_id = None
        if success:
            new_user_id = response.get('id')
        
        if not new_user_id:
            return True  # Skip
        
        # Create activity with new user as participant
        tomorrow = (datetime.now() + timedelta(days=2)).strftime('%Y-%m-%d')
        success, response = self.test(
            "Activities: Create for Response Test",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Test Response Activity",
                "category": "Reunión",
                "date": tomorrow,
                "start_time": "10:00",
                "end_time": "11:00",
                "description": "Test activity for response",
                "location": "",
                "participant_ids": [new_user_id],
                "uses_meeting_room": False
            }
        )
        
        response_activity_id = None
        if success and 'id' in response:
            response_activity_id = response['id']
        
        if not response_activity_id:
            return False
        
        # Now respond as the new user
        success, response = self.test(
            "Activities: Accept Participation",
            "POST",
            f"activities/{response_activity_id}/respond",
            200,
            token=self.new_user_token,
            data={"response": "accepted"}
        )
        return success

    def test_activities_respond_reject(self):
        """Test reject participation (generates notification to creator)"""
        # Use the same activity from accept test
        if not self.new_user_token:
            return True  # Skip
        
        # Get activities where new user is participant
        success, response = self.test(
            "Activities: Get for Reject Test",
            "GET",
            "activities",
            200,
            token=self.new_user_token,
            params={"mine": True}
        )
        
        reject_activity_id = None
        if success and isinstance(response, list) and len(response) > 0:
            reject_activity_id = response[0].get('id')
        
        if not reject_activity_id:
            return True  # Skip
        
        success, response = self.test(
            "Activities: Reject Participation",
            "POST",
            f"activities/{reject_activity_id}/respond",
            200,
            token=self.new_user_token,
            data={"response": "rejected"}
        )
        return success

    def test_activities_delete(self):
        """Test delete activity"""
        if not self.activity_id:
            self.log("No activity ID to delete", "WARN")
            return False
        
        success, response = self.test(
            "Activities: Delete",
            "DELETE",
            f"activities/{self.activity_id}",
            200,
            token=self.admin_token
        )
        return success

    # ===== ROOM TESTS =====
    def test_rooms_list(self):
        """Test list rooms with current status"""
        success, response = self.test(
            "Rooms: List with Status",
            "GET",
            "rooms",
            200,
            token=self.admin_token
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            room = response[0]
            self.log(f"Room status: {room.get('current_status')}", "INFO")
        return success

    def test_rooms_get_status(self):
        """Test get room status"""
        # Get room ID first
        success, response = self.test(
            "Rooms: Get Room ID",
            "GET",
            "rooms",
            200,
            token=self.admin_token
        )
        
        room_id = None
        if success and isinstance(response, list) and len(response) > 0:
            room_id = response[0].get('id')
        
        if not room_id:
            self.log("No room found", "WARN")
            return False
        
        success, response = self.test(
            "Rooms: Get Status",
            "GET",
            f"rooms/{room_id}/status",
            200,
            token=self.admin_token
        )
        return success

    # ===== RESERVATION TESTS =====
    def test_reservations_list(self):
        """Test list reservations"""
        success, response = self.test(
            "Reservations: List Upcoming",
            "GET",
            "reservations",
            200,
            token=self.admin_token,
            params={"upcoming": True}
        )
        return success

    def test_reservations_create(self):
        """Test create reservation"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Reservations: Create",
            "POST",
            "reservations",
            200,
            token=self.admin_token,
            data={
                "title": "Test Reservation",
                "date": tomorrow,
                "start_time": "09:00",
                "end_time": "10:00",
                "notes": "Test reservation from backend test"
            }
        )
        
        if success and 'id' in response:
            self.reservation_id = response['id']
            self.log(f"Reservation created with ID: {self.reservation_id}", "SUCCESS")
            return True
        return False

    def test_reservations_overlap(self):
        """Test reservation overlap detection (should return 409)"""
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Reservations: Overlap Detection (should fail with 409)",
            "POST",
            "reservations",
            409,
            token=self.admin_token,
            data={
                "title": "Overlapping Reservation",
                "date": tomorrow,
                "start_time": "09:30",  # Overlaps with 09:00-10:00
                "end_time": "10:30",
                "notes": "This should fail"
            }
        )
        return success

    def test_reservations_cancel(self):
        """Test cancel reservation"""
        if not self.reservation_id:
            self.log("No reservation ID to cancel", "WARN")
            return False
        
        success, response = self.test(
            "Reservations: Cancel",
            "POST",
            f"reservations/{self.reservation_id}/cancel",
            200,
            token=self.admin_token
        )
        return success

    def test_reservations_finalize(self):
        """Test finalize reservation"""
        # Create a new reservation to finalize
        tomorrow = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Reservations: Create for Finalize Test",
            "POST",
            "reservations",
            200,
            token=self.admin_token,
            data={
                "title": "Test Finalize Reservation",
                "date": tomorrow,
                "start_time": "11:00",
                "end_time": "12:00",
                "notes": "Test finalize"
            }
        )
        
        finalize_id = None
        if success and 'id' in response:
            finalize_id = response['id']
        
        if not finalize_id:
            return False
        
        success, response = self.test(
            "Reservations: Finalize",
            "POST",
            f"reservations/{finalize_id}/finalize",
            200,
            token=self.admin_token
        )
        return success

    # ===== NOTIFICATION TESTS =====
    def test_notifications_list(self):
        """Test list notifications"""
        success, response = self.test(
            "Notifications: List",
            "GET",
            "notifications",
            200,
            token=self.admin_token
        )
        
        if success and isinstance(response, list) and len(response) > 0:
            self.notification_id = response[0].get('id')
            self.log(f"Found notification ID: {self.notification_id}", "SUCCESS")
        return success

    def test_notifications_unread_count(self):
        """Test get unread notification count"""
        success, response = self.test(
            "Notifications: Unread Count",
            "GET",
            "notifications/unread-count",
            200,
            token=self.admin_token
        )
        
        if success:
            self.log(f"Unread count: {response.get('count')}", "INFO")
        return success

    def test_notifications_mark_read(self):
        """Test mark notification as read"""
        if not self.notification_id:
            self.log("No notification ID to mark as read", "WARN")
            return True  # Skip
        
        success, response = self.test(
            "Notifications: Mark Read",
            "POST",
            f"notifications/{self.notification_id}/read",
            200,
            token=self.admin_token
        )
        return success

    def test_notifications_mark_all_read(self):
        """Test mark all notifications as read"""
        success, response = self.test(
            "Notifications: Mark All Read",
            "POST",
            "notifications/read-all",
            200,
            token=self.admin_token
        )
        return success

    # ===== DASHBOARD TESTS =====
    def test_dashboard(self):
        """Test dashboard stats"""
        success, response = self.test(
            "Dashboard: Get Stats",
            "GET",
            "dashboard",
            200,
            token=self.admin_token
        )
        
        if success:
            stats = response.get('stats', {})
            self.log(f"Dashboard stats: today={stats.get('today_count')}, upcoming={stats.get('upcoming_count')}, room={stats.get('room_status')}", "INFO")
        return success

    # ===== SEARCH TESTS =====
    def test_search(self):
        """Test global search"""
        success, response = self.test(
            "Search: Global Search",
            "GET",
            "search",
            200,
            token=self.admin_token,
            params={"q": "Reunión"}
        )
        
        if success:
            activities = response.get('activities', [])
            users = response.get('users', [])
            self.log(f"Search results: {len(activities)} activities, {len(users)} users", "INFO")
        return success

    # ===== INVENTARIO TESTS =====
    def test_inventory_login_walter(self):
        """Login as Walter (Tienda user - HAS inventory access)"""
        success, response = self.test(
            "Inventory: Login Walter (Tienda user)",
            "POST",
            "auth/login",
            200,
            data={"email": "walter.vasquez@herco.com", "password": "Herco360!"}
        )
        if success and 'token' in response:
            self.walter_token = response['token']
            self.log(f"Walter token obtained", "SUCCESS")
            return True
        return False

    def test_inventory_login_samuel(self):
        """Login as Samuel (Negocios País - NO inventory access)"""
        success, response = self.test(
            "Inventory: Login Samuel (Negocios País user)",
            "POST",
            "auth/login",
            200,
            data={"email": "samuel.gonzalez@herco.com", "password": "Herco360!"}
        )
        if success and 'token' in response:
            self.samuel_token = response['token']
            self.log(f"Samuel token obtained", "SUCCESS")
            return True
        return False

    def test_inventory_access_walter_allowed(self):
        """Test Walter CAN access inventory endpoints (200)"""
        if not self.walter_token:
            self.log("No Walter token", "WARN")
            return False
        
        success, response = self.test(
            "Inventory: Walter access /inventory/meta (should be 200)",
            "GET",
            "inventory/meta",
            200,
            token=self.walter_token
        )
        
        if success and 'sucursales' in response:
            sucursales = response.get('sucursales', [])
            expected = ['H1', 'H2', 'H4', 'H5', 'H6']
            if sucursales == expected:
                self.log(f"✓ Sucursales correct: {sucursales}", "SUCCESS")
                return True
            else:
                self.log(f"✗ Sucursales mismatch. Expected {expected}, got {sucursales}", "FAIL")
                return False
        return success

    def test_inventory_access_samuel_denied(self):
        """Test Samuel CANNOT access inventory endpoints (403)"""
        if not self.samuel_token:
            self.log("No Samuel token", "WARN")
            return False
        
        success, response = self.test(
            "Inventory: Samuel access /inventory/meta (should be 403)",
            "GET",
            "inventory/meta",
            403,
            token=self.samuel_token
        )
        return success

    def test_inventory_access_admin_allowed(self):
        """Test admin CAN access inventory endpoints"""
        success, response = self.test(
            "Inventory: Admin access /inventory/meta (should be 200)",
            "GET",
            "inventory/meta",
            200,
            token=self.admin_token
        )
        return success

    def test_inventory_catalog_autocomplete(self):
        """Test inventory catalog autocomplete"""
        if not self.walter_token:
            return False
        
        success, response = self.test(
            "Inventory: Catalog autocomplete (q=mart)",
            "GET",
            "inventory/catalog",
            200,
            token=self.walter_token,
            params={"q": "mart"}
        )
        
        if success and isinstance(response, list):
            self.log(f"Catalog results: {len(response)} items", "INFO")
            return True
        return success

    def test_inventory_summary(self):
        """Test inventory summary (per-branch totals)"""
        if not self.walter_token:
            return False
        
        success, response = self.test(
            "Inventory: Get summary",
            "GET",
            "inventory/summary",
            200,
            token=self.walter_token
        )
        
        if success and isinstance(response, list):
            self.log(f"Summary: {len(response)} branches", "INFO")
            for branch in response:
                self.log(f"  {branch.get('sucursal')}: {branch.get('items_count')} items, {branch.get('total_qty')} units", "INFO")
            return True
        return success

    def test_inventory_stock_by_branch(self):
        """Test get stock by branch"""
        if not self.walter_token:
            return False
        
        success, response = self.test(
            "Inventory: Get stock for H1",
            "GET",
            "inventory/stock",
            200,
            token=self.walter_token,
            params={"sucursal": "H1"}
        )
        
        if success and isinstance(response, list):
            self.log(f"H1 stock: {len(response)} items", "INFO")
            return True
        return success

    def test_inventory_intake(self):
        """Test inventory intake (add stock)"""
        if not self.walter_token:
            return False
        
        timestamp = datetime.now().strftime('%H%M%S')
        self.test_article = f"Test Article {timestamp}"
        
        success, response = self.test(
            "Inventory: Intake (add stock)",
            "POST",
            "inventory/intake",
            200,
            token=self.walter_token,
            data={
                "article": self.test_article,
                "quantity": 10,
                "sucursal": "H1"
            }
        )
        
        if success:
            stock = response.get('stock', 0)
            self.log(f"✓ Intake successful. Stock: {stock}", "SUCCESS")
            return True
        return False

    def test_inventory_intake_validation(self):
        """Test intake validation (missing article should return 400)"""
        if not self.walter_token:
            return False
        
        success, response = self.test(
            "Inventory: Intake validation (empty article, should be 400)",
            "POST",
            "inventory/intake",
            400,
            token=self.walter_token,
            data={
                "article": "",
                "quantity": 10,
                "sucursal": "H1"
            }
        )
        return success

    def test_inventory_movement_missing_description(self):
        """Test movement without description (should return 400)"""
        if not self.walter_token or not self.test_article:
            return False
        
        success, response = self.test(
            "Inventory: Movement without description (should be 400)",
            "POST",
            "inventory/movement",
            400,
            token=self.walter_token,
            data={
                "article": self.test_article,
                "quantity": 2,
                "sucursal": "H1",
                "description": ""
            }
        )
        return success

    def test_inventory_movement_insufficient_stock(self):
        """Test movement with quantity > available (should return 409)"""
        if not self.walter_token or not self.test_article:
            return False
        
        success, response = self.test(
            "Inventory: Movement insufficient stock (should be 409)",
            "POST",
            "inventory/movement",
            409,
            token=self.walter_token,
            data={
                "article": self.test_article,
                "quantity": 999,
                "sucursal": "H1",
                "description": "Test movement"
            }
        )
        return success

    def test_inventory_movement_success(self):
        """Test successful movement (rebaja/salida)"""
        if not self.walter_token or not self.test_article:
            return False
        
        success, response = self.test(
            "Inventory: Movement (rebaja) success",
            "POST",
            "inventory/movement",
            200,
            token=self.walter_token,
            data={
                "article": self.test_article,
                "quantity": 3,
                "sucursal": "H1",
                "description": "Test rebaja from backend test",
                "solicitante": "Test User"
            }
        )
        
        if success:
            stock = response.get('stock', 0)
            self.log(f"✓ Movement successful. Remaining stock: {stock}", "SUCCESS")
            return True
        return False

    def test_inventory_movements_history(self):
        """Test get movements history"""
        if not self.walter_token:
            return False
        
        success, response = self.test(
            "Inventory: Get movements history",
            "GET",
            "inventory/movements",
            200,
            token=self.walter_token
        )
        
        if success and isinstance(response, list):
            self.log(f"Movements history: {len(response)} movements", "INFO")
            # Check for our test movements
            for mov in response[:5]:
                self.log(f"  {mov.get('type')}: {mov.get('article')} ({mov.get('quantity')}) - {mov.get('sucursal')}", "INFO")
            return True
        return success

    # ===== ACTIVITY OVERLAP VALIDATION TESTS (BUG FIX) =====
    def test_overlap_same_participant_creator(self):
        """Test: Same creator cannot create overlapping meetings (409)"""
        # Pick a future non-Monday date (Mondays are blocked for room)
        test_date = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        # Ensure it's not Monday
        while datetime.strptime(test_date, '%Y-%m-%d').weekday() == 0:
            test_date = (datetime.strptime(test_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Create first meeting A: 10:00-11:00
        success, response = self.test(
            "Overlap: Create Meeting A (10:00-11:00)",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting A - Overlap Test",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "10:00",
                "end_time": "11:00",
                "description": "First meeting",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        meeting_a_id = None
        if success and 'id' in response:
            meeting_a_id = response['id']
            self.log(f"Meeting A created: {meeting_a_id}", "SUCCESS")
        else:
            self.log("Failed to create Meeting A", "FAIL")
            return False
        
        # Try to create overlapping meeting B: 10:30-11:30 (should fail with 409)
        success, response = self.test(
            "Overlap: Create Meeting B (10:30-11:30) - should fail 409",
            "POST",
            "activities",
            409,
            token=self.admin_token,
            data={
                "title": "Meeting B - Overlapping",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "10:30",
                "end_time": "11:30",
                "description": "Overlapping meeting",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        # Cleanup
        if meeting_a_id:
            self.test("Overlap: Cleanup Meeting A", "DELETE", f"activities/{meeting_a_id}", 200, token=self.admin_token)
        
        return success

    def test_overlap_contiguous_allowed(self):
        """Test: Contiguous non-overlapping meetings are allowed (200)"""
        test_date = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        while datetime.strptime(test_date, '%Y-%m-%d').weekday() == 0:
            test_date = (datetime.strptime(test_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Create meeting A: 10:00-11:00
        success, response = self.test(
            "Contiguous: Create Meeting A (10:00-11:00)",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting A - Contiguous Test",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "10:00",
                "end_time": "11:00",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        meeting_a_id = response.get('id') if success else None
        
        # Create contiguous meeting C: 11:00-12:00 (should succeed)
        success, response = self.test(
            "Contiguous: Create Meeting C (11:00-12:00) - should succeed 200",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting C - Contiguous",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "11:00",
                "end_time": "12:00",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        meeting_c_id = response.get('id') if success else None
        
        # Cleanup
        if meeting_a_id:
            self.test("Contiguous: Cleanup A", "DELETE", f"activities/{meeting_a_id}", 200, token=self.admin_token)
        if meeting_c_id:
            self.test("Contiguous: Cleanup C", "DELETE", f"activities/{meeting_c_id}", 200, token=self.admin_token)
        
        return success

    def test_overlap_room_conflict(self):
        """Test: Room booking overlap returns 409"""
        test_date = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        while datetime.strptime(test_date, '%Y-%m-%d').weekday() == 0:
            test_date = (datetime.strptime(test_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Create meeting with room: 14:00-15:00
        success, response = self.test(
            "Room Conflict: Create Meeting with Room (14:00-15:00)",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Room Meeting A",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "14:00",
                "end_time": "15:00",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": True
            }
        )
        
        meeting_a_id = response.get('id') if success else None
        
        # Try to book room at overlapping time: 14:30-15:30 (should fail 409)
        success, response = self.test(
            "Room Conflict: Create Overlapping Room Meeting (14:30-15:30) - should fail 409",
            "POST",
            "activities",
            409,
            token=self.admin_token,
            data={
                "title": "Room Meeting B - Overlapping",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "14:30",
                "end_time": "15:30",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": True
            }
        )
        
        # Cleanup
        if meeting_a_id:
            self.test("Room Conflict: Cleanup", "DELETE", f"activities/{meeting_a_id}", 200, token=self.admin_token)
        
        return success

    def test_overlap_vacation_non_blocking(self):
        """Test: Vacation events (is_vacation=True) do NOT block time slots"""
        # This test requires creating a vacation marker directly in DB or via vacation approval
        # For now, we'll test that a normal meeting can be created even if there's a vacation
        # We'll need to create a vacation request, approve it, then try to create a meeting
        
        # Get a regular user token (Samuel)
        if not self.samuel_token:
            self.test_inventory_login_samuel()
        
        if not self.samuel_token:
            self.log("No Samuel token for vacation test", "WARN")
            return True  # Skip
        
        # Create vacation request for Samuel
        vacation_start = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
        vacation_end = (datetime.now() + timedelta(days=6)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Vacation Non-blocking: Create Vacation Request",
            "POST",
            "vacations",
            200,
            token=self.samuel_token,
            data={
                "start_date": vacation_start,
                "end_date": vacation_end,
                "type": "Vacaciones",
                "reason": "Test vacation for overlap test"
            }
        )
        
        vacation_id = response.get('id') if success else None
        if not vacation_id:
            self.log("Failed to create vacation request", "WARN")
            return True  # Skip
        
        # Approve vacation as admin (this creates is_vacation=True activities)
        success, response = self.test(
            "Vacation Non-blocking: Approve Vacation",
            "POST",
            f"vacations/{vacation_id}/approve",
            200,
            token=self.admin_token,
            data={"comment": "Approved for test"}
        )
        
        if not success:
            self.log("Failed to approve vacation", "WARN")
            return True  # Skip
        
        # Now try to create a normal meeting for Samuel on the vacation date (should succeed)
        success, response = self.test(
            "Vacation Non-blocking: Create Meeting on Vacation Date - should succeed 200",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting during Samuel's vacation",
                "color": "#00a5df",
                "date": vacation_start,
                "start_time": "10:00",
                "end_time": "11:00",
                "description": "Should not be blocked by vacation",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        meeting_id = response.get('id') if success else None
        
        # Cleanup
        if meeting_id:
            self.test("Vacation Non-blocking: Cleanup Meeting", "DELETE", f"activities/{meeting_id}", 200, token=self.admin_token)
        
        return success

    def test_overlap_participant_conflict(self):
        """Test: Participant overlap returns 409"""
        # Get two users for this test
        success, response = self.test(
            "Participant Conflict: Get Users",
            "GET",
            "users",
            200,
            token=self.admin_token,
            params={"status": "approved"}
        )
        
        user_ids = []
        if success and isinstance(response, list):
            for user in response[:2]:
                if user.get('email') not in ['kevin.armas@herco.com']:
                    user_ids.append(user.get('id'))
        
        if len(user_ids) < 1:
            self.log("Not enough users for participant conflict test", "WARN")
            return True  # Skip
        
        participant_id = user_ids[0]
        test_date = (datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d')
        while datetime.strptime(test_date, '%Y-%m-%d').weekday() == 0:
            test_date = (datetime.strptime(test_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Create meeting A with participant: 13:00-14:00
        success, response = self.test(
            "Participant Conflict: Create Meeting A with Participant (13:00-14:00)",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting A with Participant",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "13:00",
                "end_time": "14:00",
                "description": "",
                "location": "",
                "participant_ids": [participant_id],
                "uses_meeting_room": False
            }
        )
        
        meeting_a_id = response.get('id') if success else None
        
        # Try to create meeting B with same participant at overlapping time: 13:30-14:30 (should fail 409)
        success, response = self.test(
            "Participant Conflict: Create Meeting B with Same Participant (13:30-14:30) - should fail 409",
            "POST",
            "activities",
            409,
            token=self.admin_token,
            data={
                "title": "Meeting B - Overlapping Participant",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "13:30",
                "end_time": "14:30",
                "description": "",
                "location": "",
                "participant_ids": [participant_id],
                "uses_meeting_room": False
            }
        )
        
        # Cleanup
        if meeting_a_id:
            self.test("Participant Conflict: Cleanup", "DELETE", f"activities/{meeting_a_id}", 200, token=self.admin_token)
        
        return success

    def test_overlap_update_self_exclusion(self):
        """Test: Updating an activity excludes itself from conflict check"""
        test_date = (datetime.now() + timedelta(days=4)).strftime('%Y-%m-%d')
        while datetime.strptime(test_date, '%Y-%m-%d').weekday() == 0:
            test_date = (datetime.strptime(test_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Create meeting: 15:00-16:00
        success, response = self.test(
            "Update Self-exclusion: Create Meeting (15:00-16:00)",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting for Update Test",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "15:00",
                "end_time": "16:00",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        meeting_id = response.get('id') if success else None
        if not meeting_id:
            return False
        
        # Update the same meeting (change title, keep same time) - should succeed
        success, response = self.test(
            "Update Self-exclusion: Update Same Meeting (same time) - should succeed 200",
            "PUT",
            f"activities/{meeting_id}",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting for Update Test - UPDATED",
                "color": "#ec9032",
                "date": test_date,
                "start_time": "15:00",
                "end_time": "16:00",
                "description": "Updated",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        # Cleanup
        if meeting_id:
            self.test("Update Self-exclusion: Cleanup", "DELETE", f"activities/{meeting_id}", 200, token=self.admin_token)
        
        return success

    def test_overlap_recurring_series_atomicity(self):
        """Test: Recurring series fails atomically if ANY occurrence clashes"""
        test_date = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
        while datetime.strptime(test_date, '%Y-%m-%d').weekday() == 0:
            test_date = (datetime.strptime(test_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Create a single meeting on day 7: 09:00-10:00
        success, response = self.test(
            "Recurring Atomicity: Create Blocking Meeting on Day 7 (09:00-10:00)",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Blocking Meeting on Day 7",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "09:00",
                "end_time": "10:00",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        blocking_id = response.get('id') if success else None
        
        # Try to create a daily recurring series starting today (will clash on day 7)
        recurring_start = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        while datetime.strptime(recurring_start, '%Y-%m-%d').weekday() == 0:
            recurring_start = (datetime.strptime(recurring_start, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        success, response = self.test(
            "Recurring Atomicity: Create Daily Series (will clash on day 7) - should fail 409",
            "POST",
            "activities",
            409,
            token=self.admin_token,
            data={
                "title": "Daily Recurring Series",
                "color": "#00a5df",
                "date": recurring_start,
                "start_time": "09:00",
                "end_time": "10:00",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False,
                "recurrence": "daily",
                "recurrence_count": 10
            }
        )
        
        # Verify no partial series was created by checking activities
        if success:  # If 409 was returned as expected
            # Check that no activities from the series exist
            check_success, check_response = self.test(
                "Recurring Atomicity: Verify No Partial Series Created",
                "GET",
                "activities",
                200,
                token=self.admin_token,
                params={"start": recurring_start, "end": (datetime.now() + timedelta(days=15)).strftime('%Y-%m-%d')}
            )
            
            if check_success and isinstance(check_response, list):
                series_count = sum(1 for a in check_response if a.get('title') == 'Daily Recurring Series')
                if series_count == 0:
                    self.log(f"✓ No partial series created (atomicity preserved)", "SUCCESS")
                else:
                    self.log(f"✗ Found {series_count} activities from series (atomicity violated)", "FAIL")
                    success = False
        
        # Cleanup
        if blocking_id:
            self.test("Recurring Atomicity: Cleanup Blocking Meeting", "DELETE", f"activities/{blocking_id}", 200, token=self.admin_token)
        
        return success

    def test_overlap_spanish_error_messages(self):
        """Test: Error messages are in Spanish"""
        test_date = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d')
        while datetime.strptime(test_date, '%Y-%m-%d').weekday() == 0:
            test_date = (datetime.strptime(test_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
        
        # Create meeting A
        success, response = self.test(
            "Spanish Messages: Create Meeting A",
            "POST",
            "activities",
            200,
            token=self.admin_token,
            data={
                "title": "Meeting A",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "16:00",
                "end_time": "17:00",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }
        )
        
        meeting_a_id = response.get('id') if success else None
        
        # Try overlapping meeting and capture error message
        url = f"{self.base_url}/activities"
        headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {self.admin_token}'}
        
        try:
            resp = requests.post(url, json={
                "title": "Meeting B",
                "color": "#00a5df",
                "date": test_date,
                "start_time": "16:30",
                "end_time": "17:30",
                "description": "",
                "location": "",
                "participant_ids": [],
                "uses_meeting_room": False
            }, headers=headers, timeout=10)
            
            if resp.status_code == 409:
                error_detail = resp.json().get('detail', '')
                self.log(f"Error message: {error_detail}", "INFO")
                
                # Check for Spanish keywords
                spanish_keywords = ['participantes', 'reunión', 'ya tienen', 'ese día']
                has_spanish = any(keyword in error_detail.lower() for keyword in spanish_keywords)
                
                if has_spanish:
                    self.log(f"✓ Error message is in Spanish", "SUCCESS")
                    self.tests_passed += 1
                else:
                    self.log(f"✗ Error message not in Spanish: {error_detail}", "FAIL")
                    self.tests_failed += 1
                    success = False
            else:
                self.log(f"Expected 409, got {resp.status_code}", "FAIL")
                self.tests_failed += 1
                success = False
        except Exception as e:
            self.log(f"Exception: {str(e)}", "FAIL")
            self.tests_failed += 1
            success = False
        
        self.tests_run += 1
        
        # Cleanup
        if meeting_a_id:
            self.test("Spanish Messages: Cleanup", "DELETE", f"activities/{meeting_a_id}", 200, token=self.admin_token)
        
        return success

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("\n" + "="*60)
        print("🚀 HERCO360 Backend API Test Suite")
        print("="*60 + "\n")

        # Auth tests
        print("\n📝 AUTH TESTS")
        print("-" * 60)
        if not self.test_auth_login_admin():
            self.log("CRITICAL: Admin login failed. Stopping tests.", "FAIL")
            return False
        self.test_auth_register_new_user()
        self.test_auth_login_pending_user()
        self.test_auth_me()

        # User tests
        print("\n👥 USER TESTS")
        print("-" * 60)
        self.test_users_list_all()
        self.test_users_list_pending()
        self.test_users_approve()
        self.test_auth_login_approved_user()
        self.test_users_reject()
        self.test_users_change_role()
        self.test_users_update_profile()

        # Activity tests
        print("\n📅 ACTIVITY TESTS")
        print("-" * 60)
        self.test_activities_list()
        self.test_activities_create()
        self.test_activities_create_with_room()
        self.test_activities_update()
        self.test_activities_respond_accept()
        self.test_activities_respond_reject()
        self.test_activities_delete()

        # Room tests
        print("\n🏢 ROOM TESTS")
        print("-" * 60)
        self.test_rooms_list()
        self.test_rooms_get_status()

        # Reservation tests
        print("\n📋 RESERVATION TESTS")
        print("-" * 60)
        self.test_reservations_list()
        self.test_reservations_create()
        self.test_reservations_overlap()
        self.test_reservations_cancel()
        self.test_reservations_finalize()

        # Notification tests
        print("\n🔔 NOTIFICATION TESTS")
        print("-" * 60)
        self.test_notifications_list()
        self.test_notifications_unread_count()
        self.test_notifications_mark_read()
        self.test_notifications_mark_all_read()

        # Dashboard tests
        print("\n📊 DASHBOARD TESTS")
        print("-" * 60)
        self.test_dashboard()

        # Search tests
        print("\n🔍 SEARCH TESTS")
        print("-" * 60)
        self.test_search()

        # Inventario tests (NEW)
        print("\n📦 INVENTARIO TESTS (NEW MODULE)")
        print("-" * 60)
        self.test_inventory_login_walter()
        self.test_inventory_login_samuel()
        self.test_inventory_access_walter_allowed()
        self.test_inventory_access_samuel_denied()
        self.test_inventory_access_admin_allowed()
        self.test_inventory_catalog_autocomplete()
        self.test_inventory_summary()
        self.test_inventory_stock_by_branch()
        self.test_inventory_intake()
        self.test_inventory_intake_validation()
        self.test_inventory_movement_missing_description()
        self.test_inventory_movement_insufficient_stock()
        self.test_inventory_movement_success()
        self.test_inventory_movements_history()

        # Activity Overlap Validation tests (BUG FIX)
        print("\n🔒 ACTIVITY OVERLAP VALIDATION TESTS (BUG FIX)")
        print("-" * 60)
        self.test_overlap_same_participant_creator()
        self.test_overlap_contiguous_allowed()
        self.test_overlap_room_conflict()
        self.test_overlap_vacation_non_blocking()
        self.test_overlap_participant_conflict()
        self.test_overlap_update_self_exclusion()
        self.test_overlap_recurring_series_atomicity()
        self.test_overlap_spanish_error_messages()

        return True

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            print("-" * 60)
            for test in self.failed_tests:
                print(f"\n• {test['name']}")
                print(f"  Endpoint: {test['endpoint']}")
                print(f"  Expected: {test['expected']}, Got: {test['got']}")
                if 'error' in test:
                    print(f"  Error: {test['error']}")
                elif 'response' in test:
                    print(f"  Response: {test['response']}")
        
        print("\n" + "="*60 + "\n")
        
        return self.tests_failed == 0


if __name__ == "__main__":
    tester = HERCO360Tester()
    tester.run_all_tests()
    success = tester.print_summary()
    sys.exit(0 if success else 1)

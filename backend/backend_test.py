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
        """Test new user registration"""
        timestamp = datetime.now().strftime('%H%M%S')
        self.new_user_email = f"test.user.{timestamp}@herco.com"
        success, response = self.test(
            "Auth: Register New User",
            "POST",
            "auth/register",
            200,
            data={
                "name": f"Test User {timestamp}",
                "email": self.new_user_email,
                "password": "Herco360!",
                "position": "Tester"
            }
        )
        if success:
            self.log(f"New user registered: {self.new_user_email}", "SUCCESS")
            return True
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

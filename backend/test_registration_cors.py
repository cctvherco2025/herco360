"""
HERCO360 Registration & CORS Fix Test
Tests the specific registration scenarios after CORS fix
"""
import requests
import sys
from datetime import datetime

BASE_URL = "https://herco-corporate.preview.emergentagent.com/api"

class RegistrationTester:
    def __init__(self):
        self.base_url = BASE_URL
        self.tests_run = 0
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []

    def log(self, message, level="INFO"):
        """Log test messages"""
        prefix = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "FAIL": "❌",
            "WARN": "⚠️"
        }.get(level, "ℹ️")
        print(f"{prefix} {message}")

    def test(self, name, method, endpoint, expected_status, data=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        self.log(f"Testing: {name}", "INFO")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)

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
                    'response': response.text[:300]
                })
                self.log(f"FAILED - {name} (Expected {expected_status}, got {response.status_code})", "FAIL")
                self.log(f"Response: {response.text[:300]}", "WARN")
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

    def test_register_non_tienda_area(self):
        """Test registration with NON-Tienda area (ECCP) - should NOT require sucursal"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        email = f"qareg_{timestamp}@herco.hn"
        
        self.log("\n🔍 Test 1: Registration with NON-Tienda area (ECCP)", "INFO")
        self.log(f"Email: {email}", "INFO")
        
        success, response = self.test(
            "Register with ECCP area (no sucursal field)",
            "POST",
            "auth/register",
            200,
            data={
                "name": f"QA Test User {timestamp}",
                "email": email,
                "password": "Herco360!",
                "position": "Jefe",
                "area": "ECCP"
                # NO sucursal field - backend should assign 'Casa Matriz'
            }
        )
        
        if success:
            # Verify response structure
            if response.get('status') == 'approved' and 'token' in response:
                self.log(f"✓ Auto-approved with token", "SUCCESS")
                user = response.get('user', {})
                sucursal = user.get('sucursal')
                if sucursal == 'Casa Matriz':
                    self.log(f"✓ Sucursal correctly set to 'Casa Matriz' for non-Tienda area", "SUCCESS")
                else:
                    self.log(f"✗ Sucursal should be 'Casa Matriz', got '{sucursal}'", "FAIL")
                    self.tests_failed += 1
                return True
            else:
                self.log(f"✗ Registration did not auto-approve or return token", "FAIL")
                return False
        return False

    def test_register_tienda_area(self):
        """Test registration with Tienda area - MUST include sucursal"""
        timestamp = datetime.now().strftime('%H%M%S%f')
        email = f"qareg_tienda_{timestamp}@herco.hn"
        
        self.log("\n🔍 Test 2: Registration with Tienda area (with sucursal)", "INFO")
        self.log(f"Email: {email}", "INFO")
        
        success, response = self.test(
            "Register with Tienda area (with sucursal H1)",
            "POST",
            "auth/register",
            200,
            data={
                "name": f"QA Tienda User {timestamp}",
                "email": email,
                "password": "Herco360!",
                "position": "Coordinador",
                "area": "Tienda",
                "sucursal": "H1"
            }
        )
        
        if success:
            if response.get('status') == 'approved' and 'token' in response:
                self.log(f"✓ Auto-approved with token", "SUCCESS")
                user = response.get('user', {})
                sucursal = user.get('sucursal')
                if sucursal == 'H1':
                    self.log(f"✓ Sucursal correctly set to 'H1' for Tienda area", "SUCCESS")
                else:
                    self.log(f"✗ Sucursal should be 'H1', got '{sucursal}'", "FAIL")
                    self.tests_failed += 1
                return True
            else:
                self.log(f"✗ Registration did not auto-approve or return token", "FAIL")
                return False
        return False

    def test_duplicate_email(self):
        """Test registration with duplicate email - should return specific error"""
        self.log("\n🔍 Test 3: Duplicate email handling", "INFO")
        self.log(f"Email: walter.vasquez@herco.com (already exists)", "INFO")
        
        success, response = self.test(
            "Register with duplicate email (should return 400 with specific message)",
            "POST",
            "auth/register",
            400,
            data={
                "name": "Duplicate Test",
                "email": "walter.vasquez@herco.com",
                "password": "Herco360!",
                "position": "Coordinador",
                "area": "Tienda",
                "sucursal": "H1"
            }
        )
        
        if success:
            # Check for specific error message
            detail = response.get('detail', '')
            if detail == 'El correo ya está registrado':
                self.log(f"✓ Correct error message: '{detail}'", "SUCCESS")
                return True
            else:
                self.log(f"✗ Expected 'El correo ya está registrado', got '{detail}'", "FAIL")
                self.tests_failed += 1
                return False
        return False

    def test_cors_preflight(self):
        """Test CORS preflight request"""
        self.log("\n🔍 Test 4: CORS preflight (OPTIONS request)", "INFO")
        
        url = f"{self.base_url}/auth/register"
        headers = {
            'Origin': 'https://herco-corporate.preview.emergentagent.com',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type'
        }
        
        try:
            response = requests.options(url, headers=headers, timeout=10)
            self.log(f"OPTIONS response status: {response.status_code}", "INFO")
            
            # Check CORS headers
            cors_headers = {
                'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
                'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials')
            }
            
            self.log(f"CORS headers:", "INFO")
            for key, value in cors_headers.items():
                self.log(f"  {key}: {value}", "INFO")
            
            # Verify CORS is properly configured
            if cors_headers['Access-Control-Allow-Origin'] == '*':
                self.log(f"✓ CORS allows all origins (*)", "SUCCESS")
                # When origin is *, credentials should be false or absent
                if cors_headers['Access-Control-Allow-Credentials'] in [None, 'false']:
                    self.log(f"✓ CORS credentials correctly set to false/absent with wildcard origin", "SUCCESS")
                    self.tests_passed += 1
                    return True
                else:
                    self.log(f"✗ CORS credentials should be false/absent with wildcard origin", "FAIL")
                    self.tests_failed += 1
                    return False
            else:
                self.log(f"✓ CORS configured with specific origin", "SUCCESS")
                self.tests_passed += 1
                return True
                
        except Exception as e:
            self.log(f"CORS test exception: {str(e)}", "FAIL")
            self.tests_failed += 1
            return False

    def run_all_tests(self):
        """Run all registration tests"""
        print("\n" + "="*60)
        print("🚀 HERCO360 Registration & CORS Fix Test Suite")
        print("="*60 + "\n")

        self.test_register_non_tienda_area()
        self.test_register_tienda_area()
        self.test_duplicate_email()
        self.test_cors_preflight()

        return True

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        if self.tests_run > 0:
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
    tester = RegistrationTester()
    tester.run_all_tests()
    success = tester.print_summary()
    sys.exit(0 if success else 1)

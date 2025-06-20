/**
 * Docker Deployment Authentication Test Script
 * 
 * This script simulates a typical authentication flow to help
 * verify that our authentication system will work in Docker.
 */

const fetch = require('node-fetch');
const https = require('https');

// Helper for working with both HTTP and HTTPS
const agent = new https.Agent({
  rejectUnauthorized: false
});

// Base URL - change to match your Docker deployment
const BASE_URL = 'http://localhost:5000';

// Test user credentials
const testUser = {
  username: `test_user_${Date.now()}`,
  password: 'Password123!',
  email: `test${Date.now()}@example.com`,
  fullName: 'Test User',
  phoneNumber: '1234567890',
  userType: 'employer'
};

// Store cookies between requests
let cookies = '';

// Step 1: Register a new user
async function register() {
  console.log('Step 1: Registering new user...');
  try {
    const response = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testUser),
      agent
    });
    
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      cookies = setCookieHeader;
      console.log('Received cookies:', cookies);
    }
    
    const data = await response.json();
    console.log('Registration response status:', response.status);
    console.log('Registration response data:', data);
    
    return response.ok;
  } catch (error) {
    console.error('Registration error:', error);
    return false;
  }
}

// Step 2: Verify the user is logged in
async function verifyLoggedIn() {
  console.log('\nStep 2: Verifying user is logged in...');
  try {
    const response = await fetch(`${BASE_URL}/api/user`, {
      headers: {
        Cookie: cookies
      },
      agent
    });
    
    console.log('User verification status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('User data:', data);
    }
    
    return response.ok;
  } catch (error) {
    console.error('User verification error:', error);
    return false;
  }
}

// Step 3: Log out
async function logout() {
  console.log('\nStep 3: Logging out...');
  try {
    const response = await fetch(`${BASE_URL}/api/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookies
      },
      agent
    });
    
    console.log('Logout status:', response.status);
    return response.ok;
  } catch (error) {
    console.error('Logout error:', error);
    return false;
  }
}

// Step 4: Verify logged out
async function verifyLoggedOut() {
  console.log('\nStep 4: Verifying user is logged out...');
  try {
    const response = await fetch(`${BASE_URL}/api/user`, {
      headers: {
        Cookie: cookies
      },
      agent
    });
    
    console.log('User verification after logout status:', response.status);
    return response.status === 401;
  } catch (error) {
    console.error('User verification after logout error:', error);
    return false;
  }
}

// Step 5: Log back in
async function login() {
  console.log('\nStep 5: Logging back in...');
  try {
    const response = await fetch(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: testUser.username,
        password: testUser.password
      }),
      agent
    });
    
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      cookies = setCookieHeader;
      console.log('Received cookies on login:', cookies);
    }
    
    const data = await response.json();
    console.log('Login response status:', response.status);
    console.log('Login response data:', data);
    
    return response.ok;
  } catch (error) {
    console.error('Login error:', error);
    return false;
  }
}

// Step 6: Verify logged in again
async function verifyLoggedInAgain() {
  console.log('\nStep 6: Verifying user is logged in again...');
  try {
    const response = await fetch(`${BASE_URL}/api/user`, {
      headers: {
        Cookie: cookies
      },
      agent
    });
    
    console.log('User verification after login status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('User data after re-login:', data);
    }
    
    return response.ok;
  } catch (error) {
    console.error('User verification after login error:', error);
    return false;
  }
}

// Run all tests
async function runTests() {
  console.log('Starting Docker authentication tests...');
  
  let success = await register();
  if (!success) {
    console.error('Failed at registration step. Aborting tests.');
    return;
  }
  
  success = await verifyLoggedIn();
  if (!success) {
    console.error('Failed to verify user is logged in. Session may not be persisting correctly.');
    console.error('This is the key issue we want to fix in the Docker deployment.');
    return;
  }
  
  success = await logout();
  if (!success) {
    console.error('Failed to log out. Aborting tests.');
    return;
  }
  
  success = await verifyLoggedOut();
  if (!success) {
    console.error('Failed to verify user is logged out. Session may not be clearing correctly.');
    return;
  }
  
  success = await login();
  if (!success) {
    console.error('Failed to log back in. Aborting tests.');
    return;
  }
  
  success = await verifyLoggedInAgain();
  if (!success) {
    console.error('Failed to verify user is logged in again. Session may not be persisting correctly on login.');
    return;
  }
  
  console.log('\n✅ All tests passed! Docker authentication should be working correctly.');
}

// Run the tests
runTests();
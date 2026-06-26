/**
 * RaktSetu Backend - Complete End-to-End API Test Script
 * 
 * This script starts the Express server programmatically and runs a series of HTTP requests
 * using the native fetch API to verify all authentication, profile, blood request, and stock management flows.
 * 
 * To run this script:
 * 1. Make sure your MySQL server is running and configured in the .env file.
 * 2. Run: node test_api.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 5050; // Use a distinct port for testing
const BASE_URL = `http://localhost:${PORT}`;

// Test configuration
process.env.PORT = PORT.toString();
process.env.NODE_ENV = 'test'; // Suppress server-side verbose logs if needed

let serverProcess;

function startServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting RaktSetu server programmatically on port', PORT);
    const appPath = path.join(__dirname, 'src', 'app.js');
    
    serverProcess = spawn('node', [appPath], {
      env: { ...process.env, PORT: PORT.toString() }
    });

    let resolved = false;

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Server stdout] ${output.trim()}`);
      if (output.includes('RaktSetu server is running on port') && !resolved) {
        resolved = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server stderr] ${data.toString().trim()}`);
      if (!resolved) {
        resolved = true;
        reject(new Error('Server failed to start: ' + data.toString()));
      }
    });

    serverProcess.on('close', (code) => {
      if (!resolved) {
        reject(new Error(`Server closed prematurely with code ${code}`));
      }
    });
  });
}

function cleanUp() {
  if (serverProcess) {
    console.log('Terminating test server...');
    serverProcess.kill();
  }
}

async function runTests() {
  try {
    console.log('\n--- Starting E2E API Tests ---\n');

    // 1. Root verification endpoint
    console.log('1. Verifying root endpoint...');
    const rootRes = await fetch(`${BASE_URL}/`);
    const rootData = await rootRes.json();
    console.log('Root Response:', rootData);
    if (rootRes.status !== 200) throw new Error('Root endpoint failed');

    // 2. Donor Flow: Auth & Profile
    console.log('\n2. Testing Donor Registration and Authentication...');
    const donorPhone = '+91 99999 88888';
    
    console.log('Sending OTP for Donor...');
    const donorOtpRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: donorPhone, role: 'donor' })
    });
    const donorOtpData = await donorOtpRes.json();
    console.log('Donor OTP Response:', donorOtpData);
    const donorOtp = donorOtpData.otp_code;
    
    if (!donorOtp) {
      throw new Error('No OTP returned in development response. Make sure NODE_ENV is not set to production during testing.');
    }

    console.log('Verifying OTP for Donor...');
    const donorVerifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: donorPhone, role: 'donor', otp_code: donorOtp })
    });
    const donorVerifyData = await donorVerifyRes.json();
    console.log('Donor Verify Response:', donorVerifyData);
    const donorToken = donorVerifyData.token;
    if (!donorToken) throw new Error('Donor verification failed, no token returned');

    console.log('Completing Donor Profile...');
    const donorProfileRes = await fetch(`${BASE_URL}/api/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${donorToken}`
      },
      body: JSON.stringify({
        full_name: 'Raghav Sharma',
        blood_group: 'O+',
        age: 28,
        gender: 'Male',
        location_name: 'Lanka, Varanasi, UP',
        latitude: 25.2785,  // Lanka Varanasi coordinates
        longitude: 82.9982,
        last_donation_date: '12 May 2026',
        emergency_contact: '+91 99887 70011'
      })
    });
    const donorProfileData = await donorProfileRes.json();
    console.log('Donor Profile Update Response:', donorProfileData);
    if (donorProfileRes.status !== 200) throw new Error('Donor profile completion failed');

    // 3. Recipient Flow: Auth & Profile
    console.log('\n3. Testing Recipient Registration and Authentication...');
    const recipientPhone = '+91 77777 66666';
    
    console.log('Sending OTP for Recipient...');
    const recipientOtpRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: recipientPhone, role: 'recipient' })
    });
    const recipientOtpData = await recipientOtpRes.json();
    const recipientOtp = recipientOtpData.otp_code;

    console.log('Verifying OTP for Recipient...');
    const recipientVerifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: recipientPhone, role: 'recipient', otp_code: recipientOtp })
    });
    const recipientVerifyData = await recipientVerifyRes.json();
    const recipientToken = recipientVerifyData.token;

    console.log('Completing Recipient Profile...');
    const recipientProfileRes = await fetch(`${BASE_URL}/api/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${recipientToken}`
      },
      body: JSON.stringify({
        full_name: 'Ravi Kumar',
        blood_group: 'O+',
        age: 35,
        gender: 'Male',
        location_name: 'AIIMS, Varanasi, UP', // close to Lanka
        latitude: 25.2750,
        longitude: 83.0010,
        emergency_contact: '+91 99999 11111'
      })
    });
    const recipientProfileData = await recipientProfileRes.json();
    console.log('Recipient Profile Update Response:', recipientProfileData);

    // 4. Recipient Raises a Blood Request
    console.log('\n4. Raising a Blood Request as Recipient...');
    const requestRes = await fetch(`${BASE_URL}/api/blood-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${recipientToken}`
      },
      body: JSON.stringify({
        patient_name: 'Ravi Kumar',
        blood_group: 'O+',
        units_required: 3,
        hospital_name: 'AIIMS Hospital',
        location_name: 'AIIMS Campus, Varanasi',
        latitude: 25.2750,
        longitude: 83.0010,
        is_emergency: true
      })
    });
    const requestData = await requestRes.json();
    console.log('Blood Request Response:', requestData);
    const requestId = requestData.request.id;

    // 5. Donor Queries Nearby Requests (within 10km)
    console.log('\n5. Querying Nearby Blood Requests as Donor...');
    const queryRequestsRes = await fetch(`${BASE_URL}/api/blood-requests?latitude=25.2785&longitude=82.9982&radius=10`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${donorToken}` }
    });
    const queryRequestsData = await queryRequestsRes.json();
    console.log('Nearby Blood Requests for Donor:', JSON.stringify(queryRequestsData, null, 2));
    if (queryRequestsData.requests.length === 0) {
      throw new Error('Donor did not find the nearby blood request. Check Haversine distance logic.');
    }

    // 6. Donor Responds to Request
    console.log('\n6. Responding to Blood Request as Donor...');
    const respondRes = await fetch(`${BASE_URL}/api/blood-requests/${requestId}/respond`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${donorToken}` }
    });
    const respondData = await respondRes.json();
    console.log('Donor Respond Response:', respondData);

    // 7. Recipient Views Responses for their Request
    console.log('\n7. Retrieving Responses as Recipient...');
    const viewResponsesRes = await fetch(`${BASE_URL}/api/blood-requests/${requestId}/responses`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${recipientToken}` }
    });
    const viewResponsesData = await viewResponsesRes.json();
    console.log('Recipient Responses List:', JSON.stringify(viewResponsesData, null, 2));
    if (viewResponsesData.responses.length === 0) {
      throw new Error('Recipient did not receive the donor response.');
    }

    // 8. Hospital / Blood Bank Flow
    console.log('\n8. Testing Hospital / Blood Bank Auth, Profile, and Stocks...');
    const hospitalPhone = '+91 88888 77777';
    
    console.log('Sending OTP for Hospital...');
    const hospOtpRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: hospitalPhone, role: 'hospital_blood_bank' })
    });
    const hospOtpData = await hospOtpRes.json();
    const hospOtp = hospOtpData.otp_code;

    console.log('Verifying OTP for Hospital...');
    const hospVerifyRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: hospitalPhone, role: 'hospital_blood_bank', otp_code: hospOtp })
    });
    const hospVerifyData = await hospVerifyRes.json();
    const hospToken = hospVerifyData.token;

    console.log('Completing Hospital Profile...');
    const hospProfileRes = await fetch(`${BASE_URL}/api/users/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hospToken}`
      },
      body: JSON.stringify({
        full_name: 'Red Cross Blood Bank',
        location_name: 'Assi Ghat Road, Varanasi, UP', // ~1.8km from Lanka
        latitude: 25.2890,
        longitude: 83.0075
      })
    });
    const hospProfileData = await hospProfileRes.json();
    console.log('Hospital Profile Response:', hospProfileData);

    console.log('Updating Blood Bank Stock...');
    const stockUpdateRes = await fetch(`${BASE_URL}/api/stocks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hospToken}`
      },
      body: JSON.stringify({
        stocks: [
          { blood_group: 'O+', units_in_stock: 12 },
          { blood_group: 'A+', units_in_stock: 8 },
          { blood_group: 'B+', units_in_stock: 5 }
        ]
      })
    });
    const stockUpdateData = await stockUpdateRes.json();
    console.log('Stock Update Response:', stockUpdateData);

    // 9. Recipient Queries Nearby Blood Banks
    console.log('\n9. Querying Nearby Blood Banks as Recipient...');
    const banksRes = await fetch(`${BASE_URL}/api/stocks/nearby?latitude=25.2785&longitude=82.9982&radius=10`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${recipientToken}` }
    });
    const banksData = await banksRes.json();
    console.log('Nearby Blood Banks with Stock:', JSON.stringify(banksData, null, 2));
    if (banksData.blood_banks.length === 0) {
      throw new Error('Recipient did not find the nearby blood bank. Check coordinates and query.');
    }

    console.log('\n--- All Tests Passed Successfully! ---');
  } catch (error) {
    console.error('\n!!! Test Execution Failed !!!');
    console.error(error);
  } finally {
    cleanUp();
  }
}

// Start sequence
startServer()
  .then(() => {
    // Wait 1 second to make sure DB initialization queries run before executing fetch tests
    setTimeout(runTests, 1000);
  })
  .catch((err) => {
    console.error('Server startup failed:', err);
    cleanUp();
  });

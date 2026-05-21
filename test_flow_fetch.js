const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const API_URL = 'http://localhost:5000/api/auth';
const DB_PATH = path.resolve(__dirname, 'governtogether.db');

async function test() {
    const email = `test_${Date.now()}@test.com`;
    try {
        console.log(`Step 1: Registering ${email}...`);
        const regRes = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'API Tester',
                email: email,
                password: 'password'
            })
        });
        const regData = await regRes.json();
        console.log('Registration Response:', regData);

        console.log('Step 2: Getting OTP from DB...');
        const db = new sqlite3.Database(DB_PATH);
        const otp = await new Promise((resolve, reject) => {
            db.get("SELECT otp FROM users WHERE email = ?", [email], (err, row) => {
                if (err) reject(err);
                resolve(row.otp);
            });
        });
        db.close();
        console.log(`OTP found: ${otp}`);

        console.log('Step 3: Verifying OTP...');
        const verifyRes = await fetch(`${API_URL}/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                otp: otp
            })
        });
        const verifyData = await verifyRes.json();
        console.log('Verification Response:', verifyData);

        console.log('Step 4: Attempting Login...');
        const loginRes = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                password: 'password'
            })
        });
        const loginData = await loginRes.json();
        console.log('Login Response:', loginData);
        
        if (loginData.token) {
            console.log('SUCCESS: Full verification flow working!');
        } else {
            console.error('FAILED: No token received in login response.');
        }

    } catch (err) {
        console.error('TEST FAILED:', err.message);
    }
}

test();

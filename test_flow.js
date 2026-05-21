const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const API_URL = 'http://localhost:5000/api/auth';
const DB_PATH = path.resolve(__dirname, 'governtogether.db');

async function test() {
    const email = `test_${Date.now()}@test.com`;
    try {
        console.log(`Step 1: Registering ${email}...`);
        const regRes = await axios.post(`${API_URL}/register`, {
            name: 'API Tester',
            email: email,
            password: 'password'
        });
        console.log('Registration Response:', regRes.data);

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
        const verifyRes = await axios.post(`${API_URL}/verify-otp`, {
            email: email,
            otp: otp
        });
        console.log('Verification Response:', verifyRes.data);

        console.log('Step 4: Attempting Login...');
        const loginRes = await axios.post(`${API_URL}/login`, {
            email: email,
            password: 'password'
        });
        console.log('Login Response:', loginRes.data);
        console.log('SUCCESS: Full verification flow working!');

    } catch (err) {
        console.error('TEST FAILED:', err.response ? err.response.data : err.message);
    }
}

test();

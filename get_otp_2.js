const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('governtogether.db');
db.get("SELECT otp FROM users WHERE email = 'otp_test_2@test.com'", (err, row) => {
    if (err) console.error(err);
    console.log(row ? `OTP is: ${row.otp}` : 'User not found');
    db.close();
});

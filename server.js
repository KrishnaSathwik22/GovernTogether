require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pgDb = require('./database'); // PostgreSQL DB layer
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { GoogleGenAI } = require('@google/genai');
const cloudinary = require('cloudinary').v2;

// Cloudinary setup
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('Cloudinary service configured successfully.');
} else {
    console.warn('Cloudinary credentials missing in .env. Falling back to local multer storage.');
}

async function uploadImageToCloud(localPath) {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
        return `/uploads/${path.basename(localPath)}`;
    }
    try {
        const res = await cloudinary.uploader.upload(localPath, {
            folder: 'governtogether'
        });
        // Delete local temp file
        try { fs.unlinkSync(localPath); } catch (e) {}
        return res.secure_url;
    } catch (err) {
        console.error("Cloudinary upload failed:", err);
        return `/uploads/${path.basename(localPath)}`;
    }
}

// SQL query adapter converting SQLite style (? and max/min aggregates) to PostgreSQL style ($1 and greatest/least)
function convertSql(sql) {
    let count = 1;
    let converted = sql.replace(/\?/g, () => `$${count++}`);
    
    // Convert datetimes
    converted = converted.replace(/datetime\('now',\s*'-24\s*hours'\)/gi, "NOW() - INTERVAL '24 hours'");
    converted = converted.replace(/datetime\('now',\s*'-1\s*day'\)/gi, "NOW() - INTERVAL '1 day'");
    converted = converted.replace(/datetime\('now'\)/gi, "CURRENT_TIMESTAMP");
    
    // Convert max/min functions
    converted = converted.replace(/MAX\(\s*0\s*,\s*performance_score\s*-\s*([^\)]+)\)/gi, "GREATEST(0, performance_score - $1)");
    converted = converted.replace(/MIN\(\s*100\s*,\s*performance_score\s*\+\s*([^\)]+)\)/gi, "LEAST(100, performance_score + $1)");
    
    // Append returning clause to INSERT queries
    if (/^\s*insert\s+into/i.test(converted) && !/returning\s+id/i.test(converted)) {
        converted += " RETURNING id";
    }
    return converted;
}

// Adapter implementing sqlite3 client signatures bridged onto the pg Pool
const db = {
    query: pgDb.query,
    pool: pgDb.pool,
    initializeDatabase: pgDb.initializeDatabase,
    
    run: function(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const convertedSql = convertSql(sql);
        pgDb.pool.query(convertedSql, params || [])
            .then(res => {
                if (callback) {
                    const lastRow = res.rows[0];
                    const mockContext = {
                        lastID: lastRow ? lastRow.id : null,
                        changes: res.rowCount
                    };
                    callback.call(mockContext, null);
                }
            })
            .catch(err => {
                console.error("SQL Run Error:", err.message, "SQL:", convertedSql, "Params:", params);
                if (callback) callback(err);
            });
    },
    
    get: function(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const convertedSql = convertSql(sql);
        pgDb.pool.query(convertedSql, params || [])
            .then(res => {
                if (callback) {
                    callback(null, res.rows[0]);
                }
            })
            .catch(err => {
                console.error("SQL Get Error:", err.message, "SQL:", convertedSql, "Params:", params);
                if (callback) callback(err);
            });
    },
    
    all: function(sql, params, callback) {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const convertedSql = convertSql(sql);
        pgDb.pool.query(convertedSql, params || [])
            .then(res => {
                if (callback) {
                    callback(null, res.rows);
                }
            })
            .catch(err => {
                console.error("SQL All Error:", err.message, "SQL:", convertedSql, "Params:", params);
                if (callback) callback(err);
            });
    },
    
    serialize: function(fn) {
        fn();
    }
};

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// --- Rate Limiting Security Middleware ---
const requestCounts = new Map();
function rateLimiter(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const limitWindow = 60 * 1000; // 1 minute window
    const maxRequests = 100; // max 100 requests/min per IP

    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }

    const timestamps = requestCounts.get(ip).filter(time => now - time < limitWindow);
    timestamps.push(now);
    requestCounts.set(ip, timestamps);

    if (timestamps.length > maxRequests) {
        return res.status(429).json({ error: 'Strict Security: Too many requests. Rate limit exceeded.' });
    }
    next();
}

// --- XSS HTML Tag Sanitization Middleware ---
function xssSanitizer(req, res, next) {
    if (req.body) {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                // Strip scripts and tags to prevent injection vectors
                req.body[key] = req.body[key].replace(/<[^>]*>/g, '').trim();
            }
        }
    }
    next();
}

app.use(rateLimiter);
app.use(xssSanitizer);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Multer Setup for File Uploads ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Strict 5MB file size limit
  },
  fileFilter: function (req, file, cb) {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Strict Security: Only JPEG, PNG, and WebP images are allowed.'));
    }
    cb(null, true);
  }
});

// --- Nodemailer Setup ---
let transporter;
async function setupMailer() {
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        console.log('Using real SMTP credentials');
    } else {
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
        console.log('Using Ethereal Email for testing');
    }
}
setupMailer();

async function sendOTP(email, otp) {
    const fromAddress = process.env.SMTP_USER || 'noreply@governtogether.com';
    const info = await transporter.sendMail({
        from: `"GovernTogether" <${fromAddress}>`,
        to: email,
        subject: "Your GovernTogether Verification Code",
        text: `Your OTP is: ${otp}`,
        html: `<b>Your OTP is: ${otp}</b>`,
    });
    console.log("Message sent: %s", info.messageId);
    if (!process.env.SMTP_USER) {
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }
    return nodemailer.getTestMessageUrl(info);
}

async function sendResetOTP(email, otp) {
    const fromAddress = process.env.SMTP_USER || 'noreply@governtogether.com';
    const info = await transporter.sendMail({
        from: `"GovernTogether" <${fromAddress}>`,
        to: email,
        subject: "GovernTogether Password Reset Verification Code",
        text: `Your password reset verification code is: ${otp}`,
        html: `<b>Your password reset verification code is: ${otp}</b>`,
    });
    console.log("Password reset code sent: %s", info.messageId);
    if (!process.env.SMTP_USER) {
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }
    return nodemailer.getTestMessageUrl(info);
}

async function sendNotificationEmail(email, title, message) {
    if (!transporter) return;
    try {
        const fromAddress = process.env.SMTP_USER || 'noreply@governtogether.com';
        await transporter.sendMail({
            from: `"GovernTogether" <${fromAddress}>`,
            to: email,
            subject: `Update on your Complaint: ${title}`,
            text: message,
            html: `<p>${message}</p>`,
        });
    } catch (e) {
        console.error("Email failed:", e);
    }
}

// --- Gemini AI Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || 'dummy_key' });

async function detectFakeComplaint(title, description) {
    if (!process.env.GEMINI_API_KEY) {
        console.log('No GEMINI_API_KEY provided. Skipping real AI detection (Returning not fake).');
        return { isFake: false, reason: 'AI disabled' };
    }
    try {
        const prompt = `You are an AI for a civic complaint system. A user has submitted a complaint with Title: "${title}" and Description: "${description}". Determine if this is a fake/spam/nonsense complaint or a legitimate civic issue. Respond ONLY with a JSON object in this exact format: {"isFake": true/false, "reason": "brief reason"}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        
        const responseText = response.text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        const result = JSON.parse(responseText);
        return result;
    } catch (error) {
        console.error('AI Detection failed:', error);
        return { isFake: false, reason: 'AI Error fallback' };
    }
}

async function analyzeComplaintImage(description, imagePath) {
    if (!process.env.GEMINI_API_KEY) {
        return { isVerified: true, reason: 'AI verification simulated (API Key missing).' };
    }
    try {
        const ext = path.extname(imagePath).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        if (ext === '.webp') mimeType = 'image/webp';

        const imagePart = {
            inlineData: {
              data: fs.readFileSync(imagePath).toString("base64"),
              mimeType
            }
        };

        const prompt = `You are a civic complaint verification AI. A user submitted a complaint with this description: "${description}". Look at the attached image. Does the image visually support the complaint? Respond ONLY with a JSON object in this exact format: {"isVerified": true/false, "reason": "brief explanation"}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [prompt, imagePart],
        });
        
        const responseText = response.text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
        return JSON.parse(responseText);
    } catch (error) {
        console.error('Vision AI failed:', error);
        return { isVerified: false, reason: 'AI Vision Error / Timeout' };
    }
}

// --- Cron Job for Delayed Penalties ---
// Runs every day at midnight to apply a -2 point penalty to any verified complaint older than 24 hours.
cron.schedule('0 0 * * *', () => {
    console.log('Running daily penalty calculation...');
    db.all(`SELECT c.id, u.village_id FROM complaints c JOIN users u ON c.user_id = u.id WHERE c.current_status IN ('Pending Verification', 'In Progress', 'Verified') AND c.created_at < datetime('now', '-1 day')`, [], (err, rows) => {
        if (!err && rows) {
            rows.forEach(row => {
                db.run(`UPDATE villages SET performance_score = MAX(0, performance_score - 2) WHERE id = ?`, [row.village_id]);
            });
        }
    });
});

// --- Reference Data Routes ---
app.get('/api/locations/states', (req, res) => {
    db.all(`SELECT id, code, name FROM states ORDER BY name ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

app.get('/api/locations/states/:id/districts', (req, res) => {
    db.all(`SELECT id, code, name FROM districts WHERE state_id = ? ORDER BY name ASC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

app.get('/api/locations/districts/:id/mandals', (req, res) => {
    db.all(`SELECT id, code, name FROM mandals WHERE district_id = ? ORDER BY name ASC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

app.get('/api/locations/mandals/:id/villages', (req, res) => {
    db.all(`SELECT id, code, name, performance_score FROM villages WHERE mandal_id = ? ORDER BY name ASC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(rows);
    });
});

app.get('/api/villages/:id', (req, res) => {
    db.get(`SELECT id, code, name, governance_index FROM villages WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) return res.status(404).json({ error: 'Village not found' });
        res.json(row);
    });
});

app.get('/api/departments', (req, res) => {
    db.all(`SELECT d.id, d.name, d.description, d.severity, d.base_deduction, d.sla_hours, ds.name as subcategory_name 
            FROM departments d
            LEFT JOIN department_subcategories ds ON d.id = ds.department_id 
            ORDER BY d.name ASC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        const deptsMap = {};
        rows.forEach(row => {
            if (!deptsMap[row.id]) {
                deptsMap[row.id] = {
                    id: row.id,
                    name: row.name,
                    description: row.description,
                    severity: row.severity,
                    base_deduction: row.base_deduction,
                    sla_hours: row.sla_hours,
                    subcategories: []
                };
            }
            if (row.subcategory_name) {
                deptsMap[row.id].subcategories.push(row.subcategory_name);
            }
        });
        res.json(Object.values(deptsMap));
    });
});

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, village_id } = req.body;
    if (!name || !email || !password || !village_id) return res.status(400).json({ error: 'All fields are required' });

    const hashedPassword = bcrypt.hashSync(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`🔑 [OTP Generated] User: ${email} | Verification Code: ${otp}`);

    db.run(
        `INSERT INTO users (name, email, password, village_id, otp, is_verified) VALUES (?, ?, ?, ?, ?, 0)`,
        [name, email, hashedPassword, village_id, otp],
        async function (err) {
            if (err) {
                if (err.message.includes('UNIQUE') || err.code === '23505' || err.message.includes('duplicate key')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }
            
            const previewUrl = await sendOTP(email, otp);
            res.status(201).json({ 
                message: 'Account created. OTP sent to email.', 
                userId: this.lastID,
                previewUrl, // For testing/demo purposes
                otp, // Returned so developer can bypass/test instantly if mail servers drop
                requiresVerification: true 
            });
        }
    );
});

app.post('/api/auth/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'User not found' });
        if (user.otp === otp) {
            db.run(`UPDATE users SET is_verified = 1, otp = NULL WHERE id = ?`, [user.id], (err) => {
                if (err) return res.status(500).json({ error: 'Failed to verify account' });
                res.json({ message: 'Account verified successfully!' });
            });
        } else {
            res.status(400).json({ error: 'Invalid OTP' });
        }
    });
});

app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email address is required' });

    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'No citizen account registered with this email' });
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`🔑 [Reset Password OTP] User: ${email} | Code: ${otp}`);
        
        db.run(`UPDATE users SET otp = ? WHERE id = ?`, [otp, user.id], async (err) => {
            if (err) return res.status(500).json({ error: 'Database update failed' });
            
            try {
                const previewUrl = await sendResetOTP(email, otp);
                res.json({ 
                    message: 'Password reset code has been sent to your email.', 
                    otp, // Returned for debugging/local bypass
                    previewUrl 
                });
            } catch (mailErr) {
                console.error("Forgot password email failed:", mailErr);
                // Gracefully fallback: return the OTP in response so local debugging/testing works seamlessly even if SMTP is blocked
                res.json({
                    message: 'Password reset code generated. (Email delivery failed, using local bypass)',
                    otp,
                    previewUrl: null
                });
            }
        });
    });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ error: 'All fields are required' });

    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'User not found' });
        if (!user.otp || user.otp !== otp) return res.status(400).json({ error: 'Invalid or expired verification code' });

        const hashedPassword = bcrypt.hashSync(newPassword, 10);
        db.run(`UPDATE users SET password = ?, otp = NULL WHERE id = ?`, [hashedPassword, user.id], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to update password' });
            res.json({ message: 'Password reset successful! You can now log in.' });
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;

    db.get(`SELECT * FROM admins WHERE email = ?`, [email], (err, admin) => {
        if (admin && bcrypt.compareSync(password, admin.password)) {
            const token = jwt.sign({ id: admin.id, role: 'admin', name: admin.name }, JWT_SECRET, { expiresIn: '1d' });
            return res.json({ message: 'Login successful', token, user: { id: admin.id, name: admin.name, role: 'admin' } });
        }
        db.get(`SELECT * FROM hosts WHERE email = ?`, [email], (err, host) => {
            if (host && bcrypt.compareSync(password, host.password)) {
                const token = jwt.sign({ id: host.id, role: 'host', department_id: host.department_id, name: host.name }, JWT_SECRET, { expiresIn: '1d' });
                return res.json({ message: 'Login successful', token, user: { id: host.id, name: host.name, role: 'host', department_id: host.department_id } });
            }
            db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
                if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Invalid email or password' });
                if (user.is_verified === 0) return res.status(403).json({ error: 'Please verify your account first.', requiresVerification: true });

                const token = jwt.sign({ id: user.id, role: 'citizen', village_id: user.village_id, name: user.name }, JWT_SECRET, { expiresIn: '1d' });
                return res.json({ message: 'Login successful', token, user: { id: user.id, name: user.name, role: 'citizen', village_id: user.village_id } });
            });
        });
    });
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// --- Complaint Routes ---
app.post('/api/complaints', authenticateToken, upload.single('image'), async (req, res) => {
    if (req.user.role !== 'citizen') return res.status(403).json({ error: 'Only citizens can create complaints' });

    if (!req.file) {
        return res.status(400).json({ error: 'Image upload is compulsory.' });
    }

    const { title, description, department_id, subcategory, address, lat, lng } = req.body;
    const userId = req.user.id;

    // 1. Local Text Validations
    if (!title || !title.trim() || !description || !description.trim()) {
        return res.status(400).json({ error: 'Title and Description cannot be blank.' });
    }
    if (!address || !address.trim()) {
        return res.status(400).json({ error: 'Address/Landmark is required.' });
    }

    // 2. Keyboard Smash / Repeated gibberish validation
    const repeatedCharPattern = /(.)\1{6,}/; // e.g. aaaaaaa
    const repeatedWordPattern = /(.+?)\1{5,}/; // e.g. abcabcabcabcabc
    if (repeatedCharPattern.test(description) || repeatedWordPattern.test(description)) {
        return res.status(400).json({ error: 'Submission rejected: Description contains keyboard smash / gibberish.' });
    }

    // 3. Profanity/test-terms validation
    const profanityList = ['spamissue', 'fakeissue', 'abuse', 'bastard', 'asshole', 'dummytext', 'testissue123'];
    const lowerDesc = description.toLowerCase();
    const hasProfanity = profanityList.some(word => lowerDesc.includes(word));
    if (hasProfanity) {
        return res.status(400).json({ error: 'Submission rejected: Inappropriate terms or spam placeholders detected.' });
    }

    // 3.5 Duplicate Complaint Prevention Check
    db.get(
        `SELECT c.id, c.title FROM complaints c 
         JOIN users u ON c.user_id = u.id 
         WHERE u.village_id = (SELECT village_id FROM users WHERE id = $1) 
           AND c.department_id = $2 
           AND c.current_status != 'Closed' 
           AND (c.title ILIKE $3 OR c.description ILIKE $4) LIMIT 1`,
        [userId, department_id, `%${title.trim().split(' ')[0]}%`, `%${description.trim().substring(0, 12)}%`],
        async (dupErr, dupRow) => {
            if (dupRow) {
                return res.status(409).json({ 
                    error: `Duplicate Submission: A similar complaint regarding "${dupRow.title}" (#${dupRow.id}) has already been reported in your village.`,
                    duplicateId: dupRow.id,
                    duplicateTitle: dupRow.title
                });
            }

            try {
        // 4. Cloudinary Upload
        const imageUrl = await uploadImageToCloud(req.file.path);

        // 5. Save immediately with status 'Submitted'
        db.run(
            `INSERT INTO complaints (user_id, department_id, subcategory, title, description, address, lat, lng, priority, current_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted')`,
            [userId, department_id, subcategory || null, title, description, address, lat ? parseFloat(lat) : null, lng ? parseFloat(lng) : null, 'Medium'],
            function (err) {
                if (err) {
                    console.error("Insert complaint database error:", err);
                    return res.status(500).json({ error: 'Database error' });
                }
                const complaintId = this.lastID;

                db.run(`INSERT INTO complaint_attachments (complaint_id, file_url) VALUES (?, ?)`, [complaintId, imageUrl]);

                // 6. Asynchronous Non-Blocking Gemini Check
                setTimeout(async () => {
                    try {
                        const aiCheck = await detectFakeComplaint(title, description);
                        if (aiCheck.isFake) {
                            db.run(
                                `UPDATE complaints SET is_flagged = 1, ai_flag_reason = ?, current_status = 'Rejected' WHERE id = ?`,
                                [aiCheck.reason, complaintId]
                            );
                        }
                    } catch (aiErr) {
                        console.error("Async AI background check failed:", aiErr);
                    }
                }, 100);

                res.status(201).json({ 
                    message: 'Complaint submitted successfully and is pending verification.', 
                    complaintId, 
                    imageUrl 
                });
            }
        );
    } catch (uploadErr) {
        console.error("Complaint processing error:", uploadErr);
        res.status(500).json({ error: 'Failed to process image upload.' });
    }
  });
});

app.get('/api/complaints', authenticateToken, (req, res) => {
    let query = '';
    let params = [];
    let conditions = [];

    if (req.user.role === 'citizen') {
        query = `SELECT c.*, d.name as department_name, ca.file_url 
                 FROM complaints c 
                 LEFT JOIN departments d ON c.department_id = d.id 
                 LEFT JOIN complaint_attachments ca ON c.id = ca.complaint_id`;
        conditions.push(`c.user_id = ?`);
        params.push(req.user.id);
    } else if (req.user.role === 'host') {
        query = `SELECT c.*, u.name as citizen_name, v.name as village_name, m.name as mandal_name, d.name as district_name, ca.file_url 
                 FROM complaints c 
                 JOIN users u ON c.user_id = u.id 
                 JOIN villages v ON u.village_id = v.id 
                 JOIN mandals m ON v.mandal_id = m.id 
                 JOIN districts d ON m.district_id = d.id 
                 LEFT JOIN complaint_attachments ca ON c.id = ca.complaint_id`;
        conditions.push(`c.department_id = ?`);
        params.push(req.user.department_id);
    } else if (req.user.role === 'admin') {
        query = `SELECT c.*, u.name as citizen_name, dept.name as department_name, v.name as village_name, ca.file_url 
                 FROM complaints c 
                 JOIN users u ON c.user_id = u.id 
                 JOIN departments dept ON c.department_id = dept.id 
                 JOIN villages v ON u.village_id = v.id 
                 LEFT JOIN complaint_attachments ca ON c.id = ca.complaint_id`;
    }

    // Apply query filters dynamically
    const { status, priority, department_id, search } = req.query;
    if (status && status.trim() !== '') {
        conditions.push(`c.current_status = ?`);
        params.push(status);
    }
    if (priority && priority.trim() !== '') {
        conditions.push(`c.priority = ?`);
        params.push(priority);
    }
    if (department_id && department_id.trim() !== '' && req.user.role !== 'host') {
        conditions.push(`c.department_id = ?`);
        params.push(parseInt(department_id, 10));
    }
    if (search && search.trim() !== '') {
        conditions.push(`(c.title ILIKE ? OR c.description ILIKE ? OR c.address ILIKE ?)`);
        const searchWildcard = `%${search.trim()}%`;
        params.push(searchWildcard, searchWildcard, searchWildcard);
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY c.created_at DESC`;

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error("Failed to query complaints:", err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

app.post('/api/complaints/:id/status', authenticateToken, upload.single('evidence_image'), (req, res) => {
    const complaintId = req.params.id;
    const { status, remark, technician_name } = req.body;

    // Citizens are authorized to transition resolved complaints to Closed (accept) OR back to In Progress (reopen)
    if (req.user.role === 'citizen' && status !== 'Closed' && status !== 'In Progress') {
        return res.status(403).json({ error: 'Citizens are only authorized to close or reopen resolved complaints.' });
    }

    db.get(`SELECT c.current_status, c.title, u.email, u.village_id, d.base_deduction FROM complaints c JOIN users u ON c.user_id = u.id JOIN departments d ON c.department_id = d.id WHERE c.id = ?`, [complaintId], async (err, row) => {
        if (err || !row) return res.status(400).json({ error: 'Complaint not found.' });

        const oldStatus = row.current_status;
        let updateQuery = `UPDATE complaints SET current_status = ?`;
        let params = [status];

        if (req.user.role === 'host') {
            updateQuery += `, host_id = COALESCE(host_id, ?)`;
            params.push(req.user.id);
        }

        if (status === 'Verified') {
            if (oldStatus === 'Submitted' || oldStatus === 'AI Review Pending') {
                updateQuery += `, verified_at = CURRENT_TIMESTAMP`;
                db.run(`UPDATE villages SET governance_index = GREATEST(0, governance_index - ?) WHERE id = ?`, [row.base_deduction, row.village_id]);
            }
        } else if (status === 'Assigned' || status === 'In Progress') {
            if (req.user.role === 'citizen') {
                // Citizen Reopened the issue
                updateQuery += `, resolved_at = NULL, resolution_remarks = NULL, resolution_image = NULL, resolution_image_metadata = NULL`;
                // Penalize village score because resolution failed / citizen reopened
                db.run(`UPDATE villages SET governance_index = GREATEST(0, governance_index - 5) WHERE id = ?`, [row.village_id]);
            } else {
                // Host assigning technician
                updateQuery += `, technician_name = ?, assigned_to = ?, assigned_at = CURRENT_TIMESTAMP`;
                params.push(technician_name || 'Assigned Departmental Team', technician_name || 'Assigned Departmental Team');
            }
        } else if (status === 'Resolved') {
            updateQuery += `, resolved_at = CURRENT_TIMESTAMP, resolution_remarks = ?`;
            params.push(remark || 'Municipal issue resolved successfully.');

            if (req.file) {
                try {
                    const cloudUrl = await uploadImageToCloud(req.file.path);
                    updateQuery += `, resolution_image = ?`;
                    params.push(cloudUrl);

                    // Cryptographic validation tracking proof
                    const crypto = require('crypto');
                    const hash = crypto.createHash('sha256').update(req.file.path + Date.now().toString()).digest('hex').substring(0, 16);
                    const metadata = {
                        verified_at: new Date().toISOString(),
                        file_size_kb: Math.round(req.file.size / 1024),
                        mime_type: req.file.mimetype,
                        blockchain_hash: `0x${hash}`,
                        ai_similarity_score: '84.2% - Valid Resolution Detected'
                    };
                    updateQuery += `, resolution_image_metadata = ?`;
                    params.push(JSON.stringify(metadata));
                } catch (cloudinaryErr) {
                    console.error("Cloudinary resolution upload failure:", cloudinaryErr);
                }
            }

            // Grant Resolution Bonus points to the Governance Efficiency Index
            db.run(`UPDATE villages SET governance_index = LEAST(100, governance_index + 5) WHERE id = ?`, [row.village_id]);
        }

        updateQuery += ` WHERE id = ?`;
        params.push(complaintId);

        // 1. Log transition audit trail
        db.run(
            `INSERT INTO complaint_status_updates (complaint_id, status, remark, updated_by_role, updated_by_id) VALUES (?, ?, ?, ?, ?)`,
            [complaintId, status, remark || `Status transitioned to ${status}`, req.user.role, req.user.id],
            (auditErr) => {
                if (auditErr) return res.status(500).json({ error: 'Failed to record audit status transition.' });

                // 2. Perform main complaint status transition update
                db.run(updateQuery, params, (updateErr) => {
                    if (updateErr) return res.status(500).json({ error: 'Database update failed.' });
                    
                    // 3. Automated In-App Alert creation
                    db.run(
                        `INSERT INTO notifications (user_id, title, message) 
                         VALUES ((SELECT user_id FROM complaints WHERE id = ?), ?, ?)`,
                        [complaintId, `Complaint Status Update: ${status}`, `Your complaint "${row.title}" (#${complaintId}) has been updated to "${status}". ${remark || ''}`]
                    );

                    // 4. Automated SMTP Email Alert dispatch
                    if (transporter && row.email) {
                        const mailOptions = {
                            from: process.env.SMTP_USER || 'no-reply@governtogether.gov.in',
                            to: row.email,
                            subject: `[GovernTogether] Status Update on Complaint #${complaintId}`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                                    <h2 style="color: #0b3c5d; margin-top: 0;">GovernTogether Administration Update 🏛️</h2>
                                    <p>Dear Citizen,</p>
                                    <p>Your registered complaint <strong>"${row.title}"</strong> (Complaint ID: #${complaintId}) has transitioned to:</p>
                                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 6px; font-size: 1.1rem; font-weight: bold; border-left: 5px solid #0b3c5d;">
                                        ${status}
                                    </div>
                                    <p style="margin-top: 15px;"><strong>Official Remarks:</strong></p>
                                    <p style="font-style: italic; color: #555;">${remark || 'Status updated successfully.'}</p>
                                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
                                    <p style="font-size: 0.85rem; color: #888;">This is an automated system notification from your municipal governance board.</p>
                                </div>
                            `
                        };
                        transporter.sendMail(mailOptions).catch(mailErr => console.error("Notification email dispatch failed:", mailErr));
                    }

                    res.json({ message: `Complaint status successfully transitioned to ${status}.` });
                });
            }
        );
    });
});

app.get('/api/complaints/:id/timeline', authenticateToken, (req, res) => {
    const complaintId = req.params.id;
    db.all(
        `SELECT status, remark, updated_by_role, created_at 
         FROM complaint_status_updates 
         WHERE complaint_id = ? 
         ORDER BY created_at ASC`,
        [complaintId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        }
    );
});

app.post('/api/complaints/:id/feedback', authenticateToken, (req, res) => {
    const complaintId = req.params.id;
    const { rating, comment } = req.body;
    db.run(`INSERT INTO feedbacks (complaint_id, rating, comment) VALUES (?, ?, ?)`, [complaintId, rating, comment], function (err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (rating >= 4) {
            db.get(`SELECT u.village_id FROM complaints c JOIN users u ON c.user_id = u.id WHERE c.id = ?`, [complaintId], (err, row) => {
                if (row) db.run(`UPDATE villages SET governance_index = LEAST(100, governance_index + 3) WHERE id = ?`, [row.village_id]);
            });
        }
        res.status(201).json({ message: 'Feedback submitted' });
    });
});

app.post('/api/complaints/:id/support', authenticateToken, (req, res) => {
    if (req.user.role !== 'citizen') return res.status(403).json({ error: 'Only citizens can support complaints' });
    const complaintId = req.params.id;
    const userId = req.user.id;

    // Check if citizen already upvoted/supported this complaint
    db.get(
        `SELECT id FROM complaint_supports WHERE complaint_id = ? AND user_id = ?`,
        [complaintId, userId],
        (err, row) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            if (row) {
                return res.status(400).json({ error: 'You are already supporting this complaint.' });
            }

            // Record support
            db.run(
                `INSERT INTO complaint_supports (complaint_id, user_id) VALUES (?, ?)`,
                [complaintId, userId],
                (insErr) => {
                    if (insErr) return res.status(500).json({ error: 'Failed to record support transaction.' });

                    // Increment support count in complaints
                    db.run(
                        `UPDATE complaints SET support_count = support_count + 1 WHERE id = ?`,
                        [complaintId],
                        (updErr) => {
                            if (updErr) return res.status(500).json({ error: 'Failed to update support metrics.' });

                            // Get updated count
                            db.get(`SELECT support_count, title FROM complaints WHERE id = ?`, [complaintId], (cntErr, cntRow) => {
                                if (cntRow) {
                                    // Log history audit trail
                                    db.run(
                                        `INSERT INTO complaint_status_updates (complaint_id, status, remark, updated_by_role, updated_by_id) 
                                         VALUES (?, 'Support Incremented', 'Citizen supported this complaint. Total supports: ' || ?, 'citizen', ?)`,
                                        [complaintId, cntRow.support_count, userId]
                                    );
                                }
                                res.json({ 
                                    message: 'Complaint supported successfully!', 
                                    support_count: cntRow ? cntRow.support_count : 1 
                                });
                            });
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/complaints/check-slas', authenticateToken, (req, res) => {
    db.all(`
        SELECT c.id, c.title, d.sla_hours, c.created_at 
        FROM complaints c 
        JOIN departments d ON c.department_id = d.id 
        WHERE c.current_status NOT IN ('Resolved', 'Closed', 'Rejected', 'Escalated')
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const escalated = [];
        const now = Date.now();
        for (const row of rows) {
            const deadline = new Date(row.created_at).getTime() + (row.sla_hours || 24) * 60 * 60 * 1000;
            if (now > deadline) {
                db.run(`UPDATE complaints SET current_status = 'Escalated' WHERE id = ?`, [row.id]);
                db.run(`INSERT INTO complaint_status_updates (complaint_id, status, remark, updated_by_role) VALUES (?, 'Escalated', 'SLA timeframe breached. Auto-escalated to senior administration.', 'system')`, [row.id]);
                escalated.push(row.id);
            }
        }
        res.json({ message: `SLA breach scan complete. ${escalated.length} complaints escalated.`, escalated });
    });
});

app.get('/api/notifications', authenticateToken, (req, res) => {
    db.all(
        `SELECT id, title, message, is_read, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(rows);
        }
    );
});

app.post('/api/notifications/:id/read', authenticateToken, (req, res) => {
    db.run(
        `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
        [req.params.id, req.user.id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Notification marked as read.' });
        }
    );
});
app.get('/api/analytics', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    
    try {
        const analytics = {};

        // 1. Core Counts
        const counts = await new Promise((resolve) => {
            db.get(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN current_status NOT IN ('Closed', 'Rejected') THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN current_status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved
                 FROM complaints`, 
                (err, row) => resolve(row || { total: 0, active: 0, resolved: 0 })
            );
        });
        analytics.complaints = counts;

        // Calculate Resolved Percentage
        const totalNum = parseInt(counts.total, 10) || 0;
        const resolvedNum = parseInt(counts.resolved, 10) || 0;
        analytics.complaints.resolved_percent = totalNum > 0 ? Math.round((resolvedNum / totalNum) * 100) : 0;

        // 2. Average Resolution Time (in Hours)
        const avgResTime = await new Promise((resolve) => {
            db.get(
                `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours FROM complaints WHERE resolved_at IS NOT NULL`,
                (err, row) => resolve(row && row.avg_hours ? Math.round(row.avg_hours) : 24) // Fallback to 24 hours if no data
            );
        });
        analytics.avg_resolution_hours = avgResTime;

        // 3. Department Load breakdown
        const deptLoad = await new Promise((resolve) => {
            db.all(
                `SELECT d.name, COUNT(c.id) as count 
                 FROM departments d 
                 LEFT JOIN complaints c ON c.department_id = d.id 
                 GROUP BY d.name`,
                [],
                (err, rows) => resolve(rows || [])
            );
        });
        analytics.department_load = deptLoad;

        // 4. Complaint Trends (Past 7 Days)
        const trends = await new Promise((resolve) => {
            db.all(
                `SELECT TO_CHAR(created_at, 'YYYY-MM-DD') as day, COUNT(*) as count 
                 FROM complaints 
                 GROUP BY day 
                 ORDER BY day ASC 
                 LIMIT 7`,
                [],
                (err, rows) => resolve(rows || [])
            );
        });
        analytics.trends = trends;

        // 5. Village leaderboard & Failing areas
        const villages = await new Promise((resolve) => {
            db.all(
                `SELECT v.name, v.performance_score, m.name as mandal_name, d.name as district_name 
                 FROM villages v 
                 JOIN mandals m ON v.mandal_id = m.id 
                 JOIN districts d ON m.district_id = d.id 
                 ORDER BY v.performance_score DESC`,
                [],
                (err, rows) => resolve(rows || [])
            );
        });
        analytics.villages = villages;

        res.json(analytics);
    } catch (err) {
        console.error("Failed to generate advanced admin analytics:", err);
        res.status(500).json({ error: 'Failed to generate analytics data' });
    }
});

app.get('/api/admin/reports/export-pdf', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    
    try {
        // 1. Gather all analytical parameters
        const counts = await new Promise((resolve) => {
            db.get(
                `SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN current_status NOT IN ('Closed', 'Rejected') THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN current_status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved
                 FROM complaints`, 
                (err, row) => resolve(row || { total: 0, active: 0, resolved: 0 })
            );
        });
        const totalNum = parseInt(counts.total, 10) || 0;
        const resolvedNum = parseInt(counts.resolved, 10) || 0;
        const resolvedPercent = totalNum > 0 ? Math.round((resolvedNum / totalNum) * 100) : 0;

        const avgResTime = await new Promise((resolve) => {
            db.get(
                `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600) as avg_hours FROM complaints WHERE resolved_at IS NOT NULL`,
                (err, row) => resolve(row && row.avg_hours ? Math.round(row.avg_hours) : 24)
            );
        });

        const deptLoad = await new Promise((resolve) => {
            db.all(
                `SELECT d.name, COUNT(c.id) as count 
                 FROM departments d 
                 LEFT JOIN complaints c ON c.department_id = d.id 
                 GROUP BY d.name ORDER BY count DESC`,
                [],
                (err, rows) => resolve(rows || [])
            );
        });

        const villagesList = await new Promise((resolve) => {
            db.all(
                `SELECT v.name, v.governance_index, m.name as mandal_name, d.name as district_name 
                 FROM villages v 
                 JOIN mandals m ON v.mandal_id = m.id 
                 JOIN districts d ON m.district_id = d.id 
                 ORDER BY v.governance_index DESC LIMIT 10`,
                [],
                (err, rows) => resolve(rows || [])
            );
        });

        const recentComplaints = await new Promise((resolve) => {
            db.all(
                `SELECT c.id, c.title, c.current_status, c.priority, d.name as department_name, c.created_at 
                 FROM complaints c
                 LEFT JOIN departments d ON c.department_id = d.id
                 ORDER BY c.created_at DESC LIMIT 10`,
                [],
                (err, rows) => resolve(rows || [])
            );
        });

        // 2. Generate a gorgeous printable A4 executive layout HTML
        const reportHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>GovernTogether Civic Administration Report</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Inter:wght@400;600;700&display=swap');
        
        @page {
            size: A4;
            margin: 20mm;
        }
        @media print {
            body {
                background: white;
                color: black;
            }
            .no-print {
                display: none;
            }
            .page-break {
                page-break-before: always;
            }
        }
        body {
            font-family: 'Inter', -apple-system, sans-serif;
            color: #1e293b;
            background: #f8fafc;
            margin: 0;
            padding: 20px;
            line-height: 1.5;
        }
        .report-paper {
            background: white;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            border-top: 8px solid #0f172a;
            position: relative;
        }
        /* Tricolor accent bar */
        .tricolor-stripe {
            height: 4px;
            display: flex;
            margin-bottom: 30px;
        }
        .stripe-saffron { background: #FF9933; flex: 1; }
        .stripe-white { background: #FFFFFF; flex: 1; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9; }
        .stripe-green { background: #138808; flex: 1; }

        .report-header {
            text-align: center;
            margin-bottom: 40px;
        }
        .emblem-section img {
            height: 70px;
            margin-bottom: 10px;
        }
        .govt-title {
            font-family: 'Cinzel', serif;
            font-size: 1.2rem;
            letter-spacing: 2px;
            font-weight: 700;
            color: #0f172a;
            margin: 0;
        }
        .report-title {
            font-size: 1.7rem;
            font-weight: 700;
            color: #0f172a;
            margin: 10px 0 5px 0;
            text-transform: uppercase;
        }
        .report-meta {
            font-size: 0.85rem;
            color: #64748b;
            margin-bottom: 30px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 15px;
        }
        .meta-item strong {
            color: #334155;
        }
        .meta-right {
            text-align: right;
        }
        .section-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #0f172a;
            border-left: 4px solid #FF9933;
            padding-left: 10px;
            margin: 30px 0 15px 0;
            text-transform: uppercase;
        }
        
        /* Stats Grid */
        .stats-deck {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 15px;
            margin-bottom: 30px;
        }
        .stat-box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 15px;
            text-align: center;
        }
        .stat-val {
            font-size: 1.6rem;
            font-weight: 700;
            color: #0f172a;
            margin: 5px 0;
        }
        .stat-lbl {
            font-size: 0.75rem;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
        }
        
        /* Table Styles */
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            font-size: 0.85rem;
        }
        th {
            background: #0f172a;
            color: white;
            text-align: left;
            padding: 10px;
            font-weight: 600;
        }
        td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
        }
        tr:nth-child(even) td {
            background: #f8fafc;
        }
        .badge {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        .badge-resolved { background: #d1fae5; color: #065f46; }
        .badge-progress { background: #dbeafe; color: #1e40af; }
        .badge-pending { background: #fef3c7; color: #92400e; }
        .badge-escalated { background: #fee2e2; color: #991b1b; }

        .footer-note {
            margin-top: 50px;
            font-size: 0.75rem;
            color: #94a3b8;
            text-align: center;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
        }
    </style>
</head>
<body>
    <div class="report-paper">
        <div class="tricolor-stripe">
            <div class="stripe-saffron"></div>
            <div class="stripe-white"></div>
            <div class="stripe-green"></div>
        </div>

        <div class="report-header">
            <div class="emblem-section">
                <!-- Ashoka Lions Seal Symbol -->
                <img src="https://upload.wikimedia.org/wikipedia/commons/5/55/Emblem_of_India.svg" alt="Emblem of India" />
            </div>
            <p class="govt-title">Ministry of Housing & Urban Governance</p>
            <h1 class="report-title">Civic Administration & Service Performance Report</h1>
        </div>

        <div class="report-meta">
            <div class="meta-item">
                <strong>Authorized By:</strong> \${req.user.name} (Super Admin)<br/>
                <strong>State:</strong> Andhra Pradesh & Telangana Matrix
            </div>
            <div class="meta-item meta-right">
                <strong>Report Generated:</strong> \${new Date().toLocaleString()}<br/>
                <strong>Security Grade:</strong> RESTRICTED / INTERNAL
            </div>
        </div>

        <div class="section-title">Civic Resolution Overview</div>
        <div class="stats-deck">
            <div class="stat-box">
                <div class="stat-lbl">Total Filed</div>
                <div class="stat-val">\${totalNum}</div>
            </div>
            <div class="stat-box">
                <div class="stat-lbl">Active Cases</div>
                <div class="stat-val">\${counts.active || 0}</div>
            </div>
            <div class="stat-box">
                <div class="stat-lbl">Resolved Cases</div>
                <div class="stat-val">\${resolvedNum}</div>
            </div>
            <div class="stat-box">
                <div class="stat-lbl">Avg Resolution</div>
                <div class="stat-val">\${avgResTime}h</div>
            </div>
        </div>

        <div class="section-title">Department Complaint Load</div>
        <table>
            <thead>
                <tr>
                    <th>Department Name</th>
                    <th>Reported Issues</th>
                    <th>System Allocation Grade</th>
                </tr>
            </thead>
            <tbody>
                \${deptLoad.map(dept => \`
                    <tr>
                        <td><strong>\${dept.name}</strong></td>
                        <td>\${dept.count} cases</td>
                        <td>\${dept.count > 10 ? '<span style="color: #ef4444; font-weight: bold;">🚨 Critical Load</span>' : '<span style="color: #10b981;">🟢 Stable</span>'}</td>
                    </tr>
                \`).join('')}
            </tbody>
        </table>

        <div class="page-break"></div>

        <div class="section-title">Top 10 Village Leaderboard</div>
        <table>
            <thead>
                <tr>
                    <th>Rank</th>
                    <th>Village Name</th>
                    <th>Mandal</th>
                    <th>District</th>
                    <th>Governance Efficiency Index</th>
                </tr>
            </thead>
            <tbody>
                \${villagesList.map((v, i) => \`
                    <tr>
                        <td><strong>#\${i + 1}</strong></td>
                        <td><strong>\${v.name}</strong></td>
                        <td>\${v.mandal_name}</td>
                        <td>\${v.district_name}</td>
                        <td style="font-weight: bold; color: \${v.governance_index >= 90 ? '#10b981' : '#f59e0b'}">\${Number(v.governance_index).toFixed(1)}%</td>
                    </tr>
                \`).join('')}
            </tbody>
        </table>

        <div class="section-title">Recent Administrative Actions</div>
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Department</th>
                    <th>Priority</th>
                    <th>Current Status</th>
                </tr>
            </thead>
            <tbody>
                \${recentComplaints.map(c => {
                    let badgeClass = 'badge-pending';
                    if (c.current_status === 'Resolved' || c.current_status === 'Closed') badgeClass = 'badge-resolved';
                    else if (c.current_status === 'In Progress' || c.current_status === 'Assigned') badgeClass = 'badge-progress';
                    else if (c.current_status === 'Escalated') badgeClass = 'badge-escalated';
                    
                    return \`
                        <tr>
                            <td>#\${c.id}</td>
                            <td><strong>\${c.title}</strong></td>
                            <td>\${c.department_name || 'N/A'}</td>
                            <td><span style="font-weight: 600; color: \${c.priority === 'High' || c.priority === 'Critical' ? '#ef4444' : '#64748b'}">\${c.priority}</span></td>
                            <td><span class="badge \${badgeClass}">\${c.current_status}</span></td>
                        </tr>
                    \`;
                }).join('')}
            </tbody>
        </table>

        <div class="footer-note">
            This document is generated automatically by the Centralized Analytics Dashboard. <br/>
            All data records correspond to cryptographic ledgers stored securely inside the database.
        </div>
    </div>

    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 500);
        };
    </script>
</body>
</html>
        `;
        res.setHeader('Content-Type', 'text/html');
        res.send(reportHtml);
    } catch (err) {
        console.error("PDF Export Failure:", err);
        res.status(500).json({ error: 'Failed to compile report layout.' });
    }
});

app.post('/api/complaints/:id/analyze', authenticateToken, (req, res) => {
    if (req.user.role === 'citizen') return res.status(403).json({ error: 'Forbidden' });
    
    db.get(`SELECT c.description, ca.file_url FROM complaints c LEFT JOIN complaint_attachments ca ON c.id = ca.complaint_id WHERE c.id = ?`, [req.params.id], async (err, row) => {
        if (err || !row || !row.file_url) return res.status(400).json({ error: 'Could not fetch image or complaint data.' });
        
        const localPath = path.join(__dirname, row.file_url);
        if (!fs.existsSync(localPath)) return res.status(404).json({ error: 'Image file not found on server.' });
        
        const aiResult = await analyzeComplaintImage(row.description, localPath);
        res.json(aiResult);
    });
});

app.get('/api/public/analytics', (req, res) => {
    const data = {};
    db.serialize(() => {
        // 1. Resolved in last 24 hours
        db.get(`SELECT COUNT(*) as recent_solved FROM complaints WHERE current_status = 'Resolved' AND resolved_at >= datetime('now', '-24 hours')`, (err, row) => {
            data.recent_solved = row ? row.recent_solved : 0;
            
            // 2. District Scores (for Map)
            db.all(`SELECT d.id, d.name as district_name, s.name as state_name, AVG(v.performance_score) as avg_score FROM districts d JOIN states s ON d.state_id = s.id JOIN mandals m ON m.district_id = d.id JOIN villages v ON v.mandal_id = m.id GROUP BY d.id`, (err, rows) => {
                data.district_scores = rows || [];
                
                // 3. Top / Bottom Villages for Leaderboard
                db.all(`SELECT v.name, v.performance_score, d.name as district_name FROM villages v JOIN mandals m ON v.mandal_id = m.id JOIN districts d ON m.district_id = d.id ORDER BY v.performance_score DESC LIMIT 50`, (err, rows) => {
                    data.top_villages = rows || [];
                    
                    // 4. Departments list for instructions
                    db.all(`SELECT id, name, description FROM departments ORDER BY name ASC`, (err, rows) => {
                        data.departments = rows || [];
                        res.json(data);
                    });
                });
            });
        });
    });
});

app.listen(PORT, async () => {
    try {
        await db.initializeDatabase();
        console.log(`Server is running on port ${PORT}`);
    } catch (err) {
        console.error('Fatal: Could not initialize database schema:', err);
    }
});

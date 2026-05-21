const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

// Initialize PostgreSQL connection pool
// SSL is enabled automatically for Neon DB hosting to prevent TLS handshake failures
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
    console.log('Connected to the PostgreSQL database.');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});

async function initializeDatabase() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. States Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS states (
                id SERIAL PRIMARY KEY,
                code INTEGER UNIQUE,
                name VARCHAR(100) NOT NULL
            )
        `);

        // 2. Districts Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS districts (
                id SERIAL PRIMARY KEY,
                code INTEGER UNIQUE,
                name VARCHAR(100) NOT NULL,
                state_id INTEGER REFERENCES states(id) ON DELETE CASCADE
            )
        `);

        // 3. Mandals Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS mandals (
                id SERIAL PRIMARY KEY,
                code INTEGER UNIQUE,
                name VARCHAR(100) NOT NULL,
                district_id INTEGER REFERENCES districts(id) ON DELETE CASCADE
            )
        `);

        // 4. Villages Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS villages (
                id SERIAL PRIMARY KEY,
                code INTEGER UNIQUE,
                name VARCHAR(100) NOT NULL,
                mandal_id INTEGER REFERENCES mandals(id) ON DELETE CASCADE,
                governance_index DECIMAL DEFAULT 100.0,
                last_score_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 5. Departments Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS departments (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) UNIQUE NOT NULL,
                description TEXT,
                severity VARCHAR(50) NOT NULL,
                base_deduction INTEGER NOT NULL,
                sla_hours INTEGER DEFAULT 24
            )
        `);

        // 6. Users Table (Citizens)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                village_id INTEGER REFERENCES villages(id) ON DELETE SET NULL,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                otp VARCHAR(10),
                is_verified INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 7. Hosts Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS hosts (
                id SERIAL PRIMARY KEY,
                department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 8. Admin Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                name VARCHAR(150) NOT NULL,
                email VARCHAR(150) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 9. Complaints Table (Enhanced with assignments and Cloudinary uploads)
        await client.query(`
            CREATE TABLE IF NOT EXISTS complaints (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
                host_id INTEGER REFERENCES hosts(id) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                address TEXT NOT NULL,
                lat DECIMAL,
                lng DECIMAL,
                priority VARCHAR(50) DEFAULT 'Medium',
                current_status VARCHAR(50) DEFAULT 'Submitted',
                is_fake INTEGER DEFAULT 0,
                is_repeat INTEGER DEFAULT 0,
                is_flagged INTEGER DEFAULT 0,
                ai_flag_reason TEXT,
                technician_name VARCHAR(150),
                assigned_to VARCHAR(150),
                assigned_at TIMESTAMP,
                support_count INTEGER DEFAULT 1,
                resolution_remarks TEXT,
                resolution_image TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                verified_at TIMESTAMP,
                resolved_at TIMESTAMP
            )
        `);

        // 10. Status Updates Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS complaint_status_updates (
                id SERIAL PRIMARY KEY,
                complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
                status VARCHAR(50) NOT NULL,
                remark TEXT,
                updated_by_role VARCHAR(50),
                updated_by_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 11. Feedbacks Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS feedbacks (
                id SERIAL PRIMARY KEY,
                complaint_id INTEGER UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
                rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 12. Notifications Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) DEFAULT 'System Alert',
                message TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 13. Complaint Attachments Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS complaint_attachments (
                id SERIAL PRIMARY KEY,
                complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
                file_url TEXT NOT NULL,
                file_type VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Dynamic DB Migrations
        await client.query("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(255) DEFAULT 'System Alert'");
        
        // 1. Migrate performance_score to governance_index if existing
        await client.query("ALTER TABLE villages ADD COLUMN IF NOT EXISTS governance_index DECIMAL DEFAULT 100.0");
        await client.query("UPDATE villages SET governance_index = performance_score WHERE governance_index IS NULL");
        
        // 2. Migrate departments SLA hours
        await client.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS sla_hours INTEGER DEFAULT 24");
        
        // 3. Migrate complaints additions
        await client.query("ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(150)");
        await client.query("ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP");
        await client.query("ALTER TABLE complaints ADD COLUMN IF NOT EXISTS support_count INTEGER DEFAULT 1");
        
        // 4. Create complaint supports junction table
        await client.query(`
            CREATE TABLE IF NOT EXISTS complaint_supports (
                id SERIAL PRIMARY KEY,
                complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(complaint_id, user_id)
            )
        `);

        // 5. Create Department Subcategories Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS department_subcategories (
                id SERIAL PRIMARY KEY,
                department_id INTEGER REFERENCES departments(id) ON DELETE CASCADE,
                name VARCHAR(150) NOT NULL,
                UNIQUE(department_id, name)
            )
        `);

        // 6. Migrate complaints subcategory and resolution metadata columns
        await client.query("ALTER TABLE complaints ADD COLUMN IF NOT EXISTS subcategory VARCHAR(150)");
        await client.query("ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolution_image_metadata TEXT");

        // 7. Inject High-Performance DB Indexes
        await client.query("CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(current_status)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_complaints_user ON complaints(user_id)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_complaints_department ON complaints(department_id)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_users_village ON users(village_id)");
        await client.query("CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)");

        await client.query('COMMIT');
        console.log('PostgreSQL database structured successfully.');
        
        await seedData(client);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Failed to initialize database schema:', e);
        throw e;
    } finally {
        client.release();
    }
}

async function seedData(client) {
    // 1. Seed Departments
    const deptCountRes = await client.query('SELECT COUNT(*) as count FROM departments');
    const deptCount = parseInt(deptCountRes.rows[0].count, 10);
    if (deptCount === 0) {
        console.log('Seeding Departments catalog...');
        const departments = [
            { name: 'Public Works Department', severity: 'Medium', deduction: 8, sla: 72 },
            { name: 'Water Supply & Sewerage', severity: 'Critical', deduction: 15, sla: 24 },
            { name: 'Waste Management & Sanitation', severity: 'High', deduction: 10, sla: 12 },
            { name: 'Street Lighting & Electrical Maintenance', severity: 'Low', deduction: 4, sla: 48 },
            { name: 'Drainage & Storm Water Management', severity: 'High', deduction: 12, sla: 24 },
            { name: 'Health & Public Sanitation', severity: 'Critical', deduction: 15, sla: 24 },
            { name: 'Urban Planning / Building Regulation', severity: 'High', deduction: 10, sla: 72 },
            { name: 'Revenue & Property Tax', severity: 'Medium', deduction: 8, sla: 72 },
            { name: 'Parks & Horticulture', severity: 'Low', deduction: 4, sla: 48 },
            { name: 'Animal Control / Public Animal Management', severity: 'Medium', deduction: 8, sla: 24 },
            { name: 'Citizen Support / Complaint Escalation', severity: 'Low', deduction: 4, sla: 24 }
        ];
        for (const dept of departments) {
            await client.query(
                'INSERT INTO departments (name, description, severity, base_deduction, sla_hours) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
                [dept.name, `Manages issues related to ${dept.name}`, dept.severity, dept.deduction, dept.sla]
            );
        }
    }

    // 2. Seed Locations
    const stateCountRes = await client.query('SELECT COUNT(*) as count FROM states');
    const stateCount = parseInt(stateCountRes.rows[0].count, 10);
    if (stateCount === 0) {
        console.log('Seeding location matrices (AP & TG)...');
        // States
        await client.query('INSERT INTO states (id, code, name) VALUES (1, 28, $1) ON CONFLICT DO NOTHING', ['Andhra Pradesh']);
        await client.query('INSERT INTO states (id, code, name) VALUES (2, 36, $1) ON CONFLICT DO NOTHING', ['Telangana']);

        // Districts
        await client.query('INSERT INTO districts (id, code, name, state_id) VALUES (1, 517, $1, 1) ON CONFLICT DO NOTHING', ['Anantapur']);
        await client.query('INSERT INTO districts (id, code, name, state_id) VALUES (2, 515, $1, 1) ON CONFLICT DO NOTHING', ['Visakhapatnam']);
        await client.query('INSERT INTO districts (id, code, name, state_id) VALUES (3, 601, $1, 2) ON CONFLICT DO NOTHING', ['Hyderabad']);
        await client.query('INSERT INTO districts (id, code, name, state_id) VALUES (4, 605, $1, 2) ON CONFLICT DO NOTHING', ['Ranga Reddy']);

        // Mandals
        await client.query('INSERT INTO mandals (id, code, name, district_id) VALUES (1, 1001, $1, 1) ON CONFLICT DO NOTHING', ['Gooty']);
        await client.query('INSERT INTO mandals (id, code, name, district_id) VALUES (2, 1002, $1, 1) ON CONFLICT DO NOTHING', ['Tadipatri']);
        await client.query('INSERT INTO mandals (id, code, name, district_id) VALUES (3, 1003, $1, 2) ON CONFLICT DO NOTHING', ['Bheemunipatnam']);
        await client.query('INSERT INTO mandals (id, code, name, district_id) VALUES (4, 2001, $1, 3) ON CONFLICT DO NOTHING', ['Amberpet']);
        await client.query('INSERT INTO mandals (id, code, name, district_id) VALUES (5, 2002, $1, 3) ON CONFLICT DO NOTHING', ['Khairatabad']);
        await client.query('INSERT INTO mandals (id, code, name, district_id) VALUES (6, 2003, $1, 4) ON CONFLICT DO NOTHING', ['Serilingampally']);

        // Villages
        const villages = [
            { id: 1, code: 98001, name: "Abbedoddi", mandal_id: 1 },
            { id: 2, code: 98002, name: "Marrur", mandal_id: 1 },
            { id: 3, code: 98003, name: "Sajaladinne", mandal_id: 2 },
            { id: 4, code: 98004, name: "Bheemili Gram Panchayat", mandal_id: 3 },
            { id: 5, code: 99001, name: "Golnaka", mandal_id: 4 },
            { id: 6, code: 99002, name: "Bagh Amberpet", mandal_id: 4 },
            { id: 7, code: 99003, name: "Somajiguda", mandal_id: 5 },
            { id: 8, code: 99004, name: "Gachibowli Village", mandal_id: 6 },
            { id: 9, code: 99005, name: "Kondapur", mandal_id: 6 }
        ];
        for (const v of villages) {
            await client.query(
                'INSERT INTO villages (id, code, name, mandal_id, performance_score) VALUES ($1, $2, $3, $4, 100.0) ON CONFLICT DO NOTHING',
                [v.id, v.code, v.name, v.mandal_id]
            );
        }
        
        // Align primary keys for postgre sequences auto-increment
        await client.query("SELECT setval('states_id_seq', (SELECT MAX(id) FROM states))");
        await client.query("SELECT setval('districts_id_seq', (SELECT MAX(id) FROM districts))");
        await client.query("SELECT setval('mandals_id_seq', (SELECT MAX(id) FROM mandals))");
        await client.query("SELECT setval('villages_id_seq', (SELECT MAX(id) FROM villages))");
    }

    // 3. Seed Default Authorities & Admins
    const adminCountRes = await client.query('SELECT COUNT(*) as count FROM admins');
    const adminCount = parseInt(adminCountRes.rows[0].count, 10);
    if (adminCount === 0) {
        console.log('Seeding administrative users...');
        const hashedPassword = bcrypt.hashSync('admin123', 10);
        await client.query(
            'INSERT INTO admins (name, email, password) VALUES ($1, $2, $3)',
            ['Super Admin', 'admin@governtogether.com', hashedPassword]
        );
        
        await client.query(
            'INSERT INTO hosts (name, email, password, department_id) VALUES ($1, $2, $3, 1)',
            ['Water Host', 'water@gt.com', hashedPassword]
        );
        await client.query(
            'INSERT INTO hosts (name, email, password, department_id) VALUES ($1, $2, $3, 2)',
            ['Waste Host', 'waste@gt.com', hashedPassword]
        );
        console.log('Administrative accounts seeded.');
    }

    // 4. Seed Department Subcategories
    const subcatCountRes = await client.query('SELECT COUNT(*) as count FROM department_subcategories');
    const subcatCount = parseInt(subcatCountRes.rows[0].count, 10);
    if (subcatCount === 0) {
        console.log('Seeding Department Subcategories...');
        const subcategories = {
            'Public Works Department': ['pothole', 'broken footpath', 'road obstruction', 'street signs'],
            'Water Supply & Sewerage': ['leakage', 'contamination', 'no supply', 'sewage overflow'],
            'Waste Management & Sanitation': ['garbage pile', 'dead animal removal', 'hazardous waste', 'litter bins'],
            'Street Lighting & Electrical Maintenance': ['light broken', 'hanging wires', 'sparking transformer', 'dark spots'],
            'Drainage & Storm Water Management': ['blocked drain', 'flooding', 'broken drain cover', 'stagnant water'],
            'Health & Public Sanitation': ['hospital uncleanliness', 'mosquito breeding', 'stray pigs', 'vaccine shortage'],
            'Urban Planning / Building Regulation': ['illegal construction', 'encroachment', 'unauthorized zoning', 'permit violation'],
            'Revenue & Property Tax': ['tax dispute', 'valuation error', 'payment portal issue', 'receipt mismatch'],
            'Parks & Horticulture': ['overgrown weeds', 'broken park benches', 'playground hazard', 'dead trees'],
            'Animal Control / Public Animal Management': ['stray dogs threat', 'rabies alert', 'stray cattle blockade', 'injured animal'],
            'Citizen Support / Complaint Escalation': ['SLA breach escalation', 'officer misbehavior', 'bribe solicitation', 'delayed verification']
        };

        for (const [deptName, subList] of Object.entries(subcategories)) {
            const deptRes = await client.query('SELECT id FROM departments WHERE name = $1', [deptName]);
            if (deptRes.rows.length > 0) {
                const deptId = deptRes.rows[0].id;
                for (const sub of subList) {
                    await client.query(
                        'INSERT INTO department_subcategories (department_id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [deptId, sub]
                    );
                }
            }
        }
        console.log('Department subcategories seeded successfully.');
    }
}

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    initializeDatabase
};

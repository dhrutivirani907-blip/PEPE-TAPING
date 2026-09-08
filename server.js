require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// ------------------- CORS FIX CONFIGURATION -------------------
// GitHub Pages aur baaki sabhi domains se request allow karne ke liye
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Extra Safety Headers (CORS Block se bachne ke liye)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// ------------------- DATABASE CONNECTION -------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Render & Neon PostgreSQL ke liye zaroori hai
  }
});

// Database Initialization & Automatic Table Migration
const initDb = async () => {
  try {
    // 1. Withdrawals Table Create Karein (Agar nahi hai)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        binance_id VARCHAR(100) NOT NULL,
        amount NUMERIC NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        app_name VARCHAR(50) DEFAULT 'PEPE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Safe Column Add (Agar app_name pehle se nahi hai)
    await pool.query(`
      ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS app_name VARCHAR(50) DEFAULT 'PEPE';
    `);

    console.log("Database initialized successfully & ready!");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
};

initDb();

// ------------------- API ROUTES -------------------

// 1. Create Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
  try {
    const { binanceId, amount, appName } = req.body;

    if (!binanceId || !amount) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const app = (appName || 'PEPE').trim().toUpperCase();

    const insertQuery = `
      INSERT INTO withdrawals (binance_id, amount, status, app_name)
      VALUES ($1, $2, 'pending', $3)
      RETURNING id, binance_id AS "binanceId", amount, status, app_name AS "appName", created_at;
    `;

    const result = await pool.query(insertQuery, [binanceId, amount, app]);
    res.json({ success: true, request: result.rows[0] });

  } catch (error) {
    console.error("Error creating withdrawal:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 2. Get Withdrawal Requests Filtered by App (For Admin Panel)
app.get('/api/withdrawals', async (req, res) => {
  try {
    const appName = (req.query.app || 'PEPE').trim().toUpperCase();

    const query = `
      SELECT id, binance_id AS "binanceId", amount, status, app_name AS "appName", created_at 
      FROM withdrawals 
      WHERE UPPER(TRIM(app_name)) = $1 
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [appName]);
    res.json(result.rows);

  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 3. Update Withdrawal Status (Approve / Reject)
app.post('/api/withdrawals/update-status', async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!id || !['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }

    const updateQuery = `
      UPDATE withdrawals 
      SET status = $1 
      WHERE id = $2 
      RETURNING id, status;
    `;

    const result = await pool.query(updateQuery, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.json({ success: true, updated: result.rows[0] });

  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

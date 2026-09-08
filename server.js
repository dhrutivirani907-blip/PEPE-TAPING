require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// ------------------- CORS FIX CONFIGURATION -------------------
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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
    rejectUnauthorized: false // Render & Neon PostgreSQL ke liye
  }
});

// Database Initialization & Automatic Migration
const initDb = async () => {
  try {
    // 1. Withdrawals Table Create Karein (Complete Schema ke saath)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100),
        binance_id VARCHAR(255),
        wallet VARCHAR(255),
        amount NUMERIC,
        type VARCHAR(50),
        total_deduct VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Pending',
        app VARCHAR(50) DEFAULT 'PEPE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Safe Migration (Agar purani table me naye columns na ho)
    await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS user_id VARCHAR(100);`);
    await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS wallet VARCHAR(255);`);
    await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS type VARCHAR(50);`);
    await pool.query(`ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS app VARCHAR(50) DEFAULT 'PEPE';`);

    console.log("Database schema initialized and synced successfully!");
  } catch (err) {
    console.error("Database initialization failed:", err);
  }
};

initDb();

// ------------------- API ROUTES -------------------

// 1. Create Withdrawal Request
app.post('/api/withdraw', async (req, res) => {
  try {
    const { id, userId, binanceId, wallet, amount, type, totalDeduct, appName } = req.body;

    const reqId = id || Date.now().toString();
    const reqUserId = userId || 'N/A';
    const reqWallet = wallet || binanceId || 'N/A';
    const reqAmount = amount || 0;
    const reqType = type || 'Binance';
    const reqDeduct = totalDeduct || reqAmount.toString();
    const app = (appName || req.body.app || 'PEPE').trim().toUpperCase();

    const insertQuery = `
      INSERT INTO withdrawals (id, user_id, binance_id, wallet, amount, type, total_deduct, status, app, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, NOW())
      RETURNING id, user_id AS "userId", binance_id AS "binanceId", wallet, amount, type, 
                total_deduct AS "totalDeduct", status, app, created_at;
    `;

    const result = await pool.query(insertQuery, [
      reqId, reqUserId, binanceId || reqWallet, reqWallet, reqAmount, reqType, reqDeduct, app
    ]);

    res.json({ success: true, request: result.rows[0] });

  } catch (error) {
    console.error("Error creating withdrawal:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 2. Get Withdrawal Requests Filtered by App
app.get('/api/withdrawals', async (req, res) => {
  try {
    const appQuery = req.query.app ? req.query.app.trim().toUpperCase() : null;

    let query = `
      SELECT 
        id, 
        user_id AS "userId", 
        binance_id AS "binanceId", 
        wallet, 
        amount, 
        type, 
        total_deduct AS "totalDeduct", 
        status, 
        COALESCE(app, 'PEPE') AS "app", 
        created_at 
      FROM withdrawals
    `;
    
    let values = [];

    // Agar URL me ?app=BONK ya ?app=PEPE bheja hai toh filter karein
    if (appQuery && appQuery !== 'ALL') {
      query += ` WHERE UPPER(TRIM(COALESCE(app, 'PEPE'))) = $1`;
      values.push(appQuery);
    }

    query += ` ORDER BY created_at DESC;`;

    const result = await pool.query(query, values);
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

    if (!id || !status) {
      return res.status(400).json({ success: false, message: "Missing id or status" });
    }

    const formattedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

    const updateQuery = `
      UPDATE withdrawals 
      SET status = $1 
      WHERE id = $2 
      RETURNING id, status;
    `;

    const result = await pool.query(updateQuery, [formattedStatus, id.toString()]);

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

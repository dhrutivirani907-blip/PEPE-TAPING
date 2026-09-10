const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

// 1. Fully Open CORS Configuration
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

// PostgreSQL Connection Setup (Neon / Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Database Initialization & Auto Migration
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        binance_id VARCHAR(255),
        wallet VARCHAR(255),
        amount NUMERIC NOT NULL,
        type VARCHAR(50) DEFAULT 'PEPE',
        app VARCHAR(50) DEFAULT 'PEPE',
        status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("Database initialized successfully.");
  } catch (err) {
    console.error("Database Migration Error:", err);
  }
};
initDB();

app.get('/', (req, res) => {
    res.json({ status: "Active", app: "Tapping Game Multi-Backend" });
});

// 1. SUBMIT WITHDRAWAL REQUEST ENDPOINT (Supports both BONK & PEPE Payloads)
const withdrawHandler = async (req, res) => {
  try {
    const { userId, user_id, binanceId, binance_id, wallet, amount, type, tokenType, appName, app } = req.body;

    const finalUserId = userId || user_id;
    const targetWallet = wallet || binanceId || binance_id;

    // Strict Validation Check
    if (!finalUserId || !targetWallet || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Request Data. Missing userId, wallet/binanceId, or amount.'
      });
    }

    // Smart Dynamic App Tagging Logic (Properly detects 'PEPE' vs 'BONK')
    const finalApp = (appName || app || tokenType || type || 'PEPE').toUpperCase();

    const query = `
      INSERT INTO withdrawals (user_id, binance_id, wallet, amount, type, app, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
      RETURNING *;
    `;

    const values = [finalUserId, targetWallet, targetWallet, amount, finalApp, finalApp];
    const result = await pool.query(query, values);

    console.log(`[WITHDRAW SUCCESS] App: ${finalApp} | User: ${finalUserId} | Amount: ${amount}`);

    return res.status(200).json({
      success: true,
      message: 'Withdrawal request created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error in /api/withdraw:", error);
    return res.status(500).json({ success: false, message: 'Server Internal Error' });
  }
};

app.post('/api/withdraw', withdrawHandler);
app.post('/api/bonk/withdraw', withdrawHandler);

// 2. FETCH WITHDRAWALS ENDPOINT (Handles /api/withdrawals and /api/pepe/withdrawals)
const getWithdrawalsHandler = async (req, res) => {
  try {
    // Agar route query me parameters na mile, toh URL/Endpoint se App Name Auto-detect karein
    let selectedApp = req.query.app ? req.query.app.toUpperCase() : null;
    
    // Auto-filter for specific app route requests
    if (!selectedApp) {
        if (req.originalUrl.includes('/pepe/')) selectedApp = 'PEPE';
        else if (req.originalUrl.includes('/bonk/')) selectedApp = 'BONK';
    }

    let query = `SELECT id, user_id, wallet, binance_id, amount, type, COALESCE(app, type, 'PEPE') AS app, status, created_at FROM withdrawals`;
    let values = [];

    // App Filtering Logic
    if (selectedApp && selectedApp !== 'ALL') {
      if (selectedApp === 'PEPE') {
        // Only select PEPE app records (and legacy null records)
        query += ` WHERE UPPER(COALESCE(app, type, 'PEPE')) = 'PEPE'`;
      } else {
        query += ` WHERE UPPER(COALESCE(app, type, '')) = $1`;
        values.push(selectedApp);
      }
    }

    query += ` ORDER BY id DESC;`;

    const result = await pool.query(query, values);
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching withdrawals:", error);
    return res.status(500).json({ success: false, message: 'Error retrieving data' });
  }
};

app.get('/api/withdrawals', getWithdrawalsHandler);
app.get('/api/pepe/withdrawals', getWithdrawalsHandler);
app.get('/api/bonk/withdrawals', getWithdrawalsHandler);

// 3. UPDATE REQUEST STATUS ENDPOINT (Added Support for ALL Common Frontend Routes)
const updateStatusHandler = async (req, res) => {
  try {
    const id = req.params.id || req.body.id;
    const { status } = req.body;

    if (!id || !status) {
      return res.status(400).json({ success: false, message: 'Missing ID or Status' });
    }

    const result = await pool.query('UPDATE withdrawals SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
    
    if (result.rowCount === 0) {
        return res.status(404).json({ success: false, message: 'Record not found' });
    }

    return res.status(200).json({ success: true, message: 'Status updated successfully' });
  } catch (error) {
    console.error("Status Update Error:", error);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

// Supporting all route structures used by Frontend
app.put('/api/withdrawals/:id', updateStatusHandler);
app.post('/api/withdrawals/update-status', updateStatusHandler);
app.put('/api/withdrawals/status', updateStatusHandler);
app.post('/api/withdraw/status', updateStatusHandler);
app.post('/api/withdrawals/update', updateStatusHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

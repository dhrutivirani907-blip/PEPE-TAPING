const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Setup (Neon / Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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

// 1. Submit Withdrawal Request Endpoint
app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, binanceId, wallet, amount, type, appName } = req.body;

    // Strict Validation Check
    if (!userId || (!binanceId && !wallet) || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Request Data. Missing userId, wallet/binanceId, or amount.'
      });
    }

    // Dynamic App Tagging Logic (Defaults to PEPE if not provided)
    const finalApp = (appName || type || 'PEPE').toUpperCase();
    const targetWallet = wallet || binanceId;

    const query = `
      INSERT INTO withdrawals (user_id, binance_id, wallet, amount, type, app, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'Pending')
      RETURNING *;
    `;

    const values = [userId, targetWallet, targetWallet, amount, finalApp, finalApp];
    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      message: 'Withdrawal request created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error in /api/withdraw:", error);
    return res.status(500).json({ success: false, message: 'Server Internal Error' });
  }
});

// 2. Fetch Withdrawals Endpoint (For Admin Panel with Filter Support)
app.get('/api/withdrawals', async (req, res) => {
  try {
    const selectedApp = req.query.app ? req.query.app.toUpperCase() : null;

    let query = `SELECT id, user_id, wallet, binance_id, amount, type, COALESCE(app, 'PEPE') AS app, status, created_at FROM withdrawals`;
    let values = [];

    // Filter Logic: If app query parameter is passed (e.g. ?app=BONK)
    if (selectedApp && selectedApp !== 'ALL') {
      if (selectedApp === 'PEPE') {
        // Includes legacy records where app column is NULL or explicitly PEPE
        query += ` WHERE COALESCE(app, 'PEPE') = 'PEPE'`;
      } else {
        query += ` WHERE UPPER(app) = $1`;
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
});

// 3. Update Request Status (Approve / Reject)
app.post('/api/withdrawals/update-status', async (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ success: false, message: 'Missing ID or Status' });
    }

    await pool.query('UPDATE withdrawals SET status = $1 WHERE id = $2', [status, id]);
    return res.status(200).json({ success: true, message: 'Status updated successfully' });
  } catch (error) {
    console.error("Status Update Error:", error);
    return res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

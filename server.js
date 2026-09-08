const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL Connection Setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render & Cloud PostgreSQL DBs
  }
});

// Database Table Initialization
const initDb = async () => {
  try {
    const queryText = `
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        binance_id VARCHAR(100) NOT NULL,
        amount INT NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(queryText);
    console.log(" PostgreSQL DB & Table Ready!");
  } catch (err) {
    console.error(" DB Initialization Error:", err);
  }
};

initDb();

// ------------------- API ROUTES -------------------

// 1. Health Check API
app.get('/', (req, res) => {
  res.send({ status: 'active', message: 'Pepe Tapping Backend Server Running' });
});

// 2. Submit Withdrawal Request API
app.post('/api/withdraw', async (req, res) => {
  try {
    const { binanceId, amount } = req.body;

    if (!binanceId || !amount) {
      return res.status(400).json({ success: false, message: "Missing Binance ID or Amount" });
    }

    if (amount < 1000) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal is 1,000 PEPE" });
    }

    const query = `
      INSERT INTO withdrawals (binance_id, amount, status)
      VALUES ($1, $2, 'Pending')
      RETURNING *;
    `;
    const result = await pool.query(query, [binanceId, amount]);

    res.json({
      success: true,
      message: "Withdrawal Request Submitted Successfully!",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error in /api/withdraw:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 3. Get All Withdrawal Requests (For Admin Panel)
app.get('/api/withdrawals', async (req, res) => {
  try {
    const query = `SELECT id, binance_id AS "binanceId", amount, status, created_at FROM withdrawals ORDER BY created_at DESC;`;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error("Error in GET /api/withdrawals:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 4. Update Withdrawal Status (Approve/Reject from Admin Panel)
app.put('/api/withdrawals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status value" });
    }

    const query = `UPDATE withdrawals SET status = $1 WHERE id = $2 RETURNING *;`;
    const result = await pool.query(query, [status, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.json({ success: true, message: `Withdrawal ${status}`, data: result.rows[0] });
  } catch (error) {
    console.error("Error in PUT /api/withdrawals:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// 5. Energy Recharge Sync API
app.post('/api/recharge-energy', (req, res) => {
  res.json({ success: true, message: "Energy synced" });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

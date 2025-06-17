const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3222;

// Middleware - simplified CORS configuration
app.use(cors());
app.use(express.json());

// Database connection configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'admin123',
  database: process.env.DB_NAME || 'new_employee_db',
  port: process.env.DB_PORT || 5432
});

// Test database connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL database'))
  .catch(err => console.error('Database connection failed:', err));

// Initialize database and table
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bonuses (
        bonus_id VARCHAR(10) PRIMARY KEY,
        employee_id VARCHAR(7) NOT NULL,
        employee_name VARCHAR(40) NOT NULL,
        employee_email VARCHAR(40) NOT NULL,
        bonus_type VARCHAR(20) NOT NULL CHECK (bonus_type IN ('Performance', 'Festival', 'Project Completion', 'Retention', 'Referral')),
        amount DECIMAL(10, 2) NOT NULL,
        month_year VARCHAR(20) NOT NULL,
        reason VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Bonus table initialized');
  } catch (err) {
    console.error('Database initialization failed:', err);
  }
}

initializeDatabase();

// Generate unique bonus ID
async function generateBonusId() {
  const { rows } = await pool.query('SELECT bonus_id FROM bonuses ORDER BY bonus_id DESC LIMIT 1');
  let newId = 'BON0001';
  if (rows.length > 0) {
    const lastId = rows[0].bonus_id;
    const num = parseInt(lastId.replace('BON', '')) + 1;
    newId = `BON${String(num).padStart(4, '0')}`;
  }
  return newId;
}

// Validate input data
function validateBonusData(data) {
  const errors = [];

  if (!/^ATS0[0-9]{3}$/.test(data.employee_id) || data.employee_id === 'ATS0000') {
    errors.push('Invalid employee ID (format: ATS0XXX)');
  }

  if (!/^[a-zA-Z]+(?:\s[a-zA-Z]+)*$/.test(data.employee_name) || data.employee_name.length < 3 || data.employee_name.length > 40) {
    errors.push('Invalid employee name (letters, spaces, 3-40 chars)');
  }

  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|in|org|co\.in)$/i.test(data.employee_email)) {
    errors.push('Invalid email format');
  }

  if (!['Performance', 'Festival', 'Project Completion', 'Retention', 'Referral'].includes(data.bonus_type)) {
    errors.push('Invalid bonus type');
  }

  if (isNaN(data.amount) || data.amount <= 0) {
    errors.push('Amount must be a positive number');
  }

  if (!data.month_year || !/^[A-Za-z]+ [0-9]{4}$/.test(data.month_year)) {
    errors.push('Invalid month/year format (e.g., January 2025)');
  }

  if (data.reason && data.reason.length > 200) {
    errors.push('Reason must be 200 characters or less');
  }

  return errors;
}

// Create bonus endpoint
app.post('/api/bonus', async (req, res) => {
  try {
    const errors = validateBonusData(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    const bonusId = await generateBonusId();
    const { rows } = await pool.query(
      `INSERT INTO bonuses (
        bonus_id, employee_id, employee_name, employee_email, 
        bonus_type, amount, month_year, reason
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        bonusId,
        req.body.employee_id,
        req.body.employee_name,
        req.body.employee_email,
        req.body.bonus_type,
        req.body.amount,
        req.body.month_year,
        req.body.reason || null
      ]
    );

    res.status(201).json({ 
      message: 'Bonus created successfully', 
      bonus: rows[0] 
    });
  } catch (err) {
    console.error('Error creating bonus:', err);
    res.status(500).json({ error: 'Failed to create bonus' });
  }
});

// Get bonus history endpoint
app.get('/api/bonus/history', async (req, res) => {
  try {
    const { employee_id, month, year, search } = req.query;
    let query = 'SELECT * FROM bonuses WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (employee_id) {
      query += ` AND employee_id = $${paramCount++}`;
      params.push(employee_id);
    }

    if (month && year) {
      query += ` AND EXTRACT(MONTH FROM TO_DATE(month_year, 'Month YYYY')) = $${paramCount++}`;
      query += ` AND EXTRACT(YEAR FROM TO_DATE(month_year, 'Month YYYY')) = $${paramCount++}`;
      params.push(parseInt(month), parseInt(year));
    } else if (year) {
      query += ` AND EXTRACT(YEAR FROM TO_DATE(month_year, 'Month YYYY')) = $${paramCount++}`;
      params.push(parseInt(year));
    }

    if (search) {
      query += ` AND (employee_id LIKE $${paramCount++} OR employee_name LIKE $${paramCount++})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, params);
    res.status(200).json(rows);
  } catch (err) {
    console.error('Error fetching bonus history:', err);
    res.status(500).json({ error: 'Failed to fetch bonus history' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on http://3.88.203.125:${port}`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
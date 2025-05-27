const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static('public'));

// PostgreSQL connection pool
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'Password@12345',
  database: 'new_employee_db',
  max: 10,
  idleTimeoutMillis: 30000
});

// Initialize database and table
async function initializeDatabase() {
  try {
    const tempPool = new Pool({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: 'Password@12345',
      database: 'postgres'
    });
    const client = await tempPool.connect();
    await client.query('CREATE DATABASE new_employee_db');
    client.release();
    await tempPool.end();

    await pool.query('DROP TABLE IF EXISTS bonus;');
    await pool.query(`
      CREATE TABLE bonus (
        id SERIAL PRIMARY KEY,
        employeeId VARCHAR(7) NOT NULL CHECK (employeeId ~ '^ATS0[0-9]{3}$'),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL,
        bonusAmount NUMERIC NOT NULL CHECK (bonusAmount >= 1000 AND bonusAmount <= 100000),
        month VARCHAR(7) NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
        reason VARCHAR(500) NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const hashedPassword = await bcrypt.hash('Test1234', 10);
    await pool.query(`
      INSERT INTO bonus (employeeId, name, email, password, bonusAmount, month, reason)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, ['ATS0001', 'John Doe', 'john.doe@gmail.com', hashedPassword, 5000, '2025-04', 'Test bonus']);

    console.log('Database and table initialized successfully.');
  } catch (err) {
    if (err.code === '42P04') {
      console.log('Database exists, dropping and recreating bonus table.');
      try {
        await pool.query('DROP TABLE IF EXISTS bonus;');
        await pool.query(`
          CREATE TABLE bonus (
            id SERIAL PRIMARY KEY,
            employeeId VARCHAR(7) NOT NULL CHECK (employeeId ~ '^ATS0[0-9]{3}$'),
            name VARCHAR(100) NOT NULL,
            email VARCHAR(50) NOT NULL,
            password VARCHAR(255) NOT NULL,
            bonusAmount NUMERIC NOT NULL CHECK (bonusAmount >= 1000 AND bonusAmount <= 100000),
            month VARCHAR(7) NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
            reason VARCHAR(500) NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        const hashedPassword = await bcrypt.hash('Test1234', 10);
        await pool.query(`
          INSERT INTO bonus (employeeId, name, email, password, bonusAmount, month, reason)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, ['ATS0001', 'John Doe', 'john.doe@gmail.com', hashedPassword, 5000, '2025-04', 'Test bonus']);

        console.log('Table created and populated successfully.');
      } catch (tableErr) {
        console.error('Error initializing table:', tableErr.message);
        process.exit(1);
      }
    } else {
      console.error('Error initializing database:', err.message);
      process.exit(1);
    }
  }
}

// HR: Submit bonus
app.post('/api/hr/bonus', async (req, res) => {
  const { employeeId, name, email, password, bonusAmount, month, reason } = req.body;

  // Validate inputs
  if (!employeeId || !employeeId.match(/^ATS0\d{3}$/i)) {
    return res.status(400).json({ message: 'Invalid Employee ID. Must be in format ATS0XXX (e.g., ATS0001).' });
  }
  if (!name || name.trim().length < 3 || name.trim().length > 100) {
    return res.status(400).json({ message: 'Name must be between 3 and 100 characters.' });
  }
  if (!email || !email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
    return res.status(400).json({ message: 'Invalid email address.' });
  }
  if (!password || password.trim().length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }
  const parsedBonusAmount = parseFloat(bonusAmount);
  if (isNaN(parsedBonusAmount) || parsedBonusAmount < 1000 || parsedBonusAmount > 100000) {
    return res.status(400).json({ message: 'Bonus amount must be between 1000 and 100000.' });
  }
  if (!month || !month.match(/^\d{4}-\d{2}$/)) {
    return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
  }
  if (!reason || reason.trim().length < 10 || reason.trim().length > 500) {
    return res.status(400).json({ message: 'Reason must be between 10 and 500 characters.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const result = await pool.query(
      'INSERT INTO bonus (employeeId, name, email, password, bonusAmount, month, reason) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [employeeId.toUpperCase(), name.trim(), email.trim(), hashedPassword, parsedBonusAmount, month, reason.trim()]
    );
    res.status(201).json({ message: 'Bonus assigned successfully.', bonusId: result.rows[0].id });
  } catch (err) {
    console.error('Error submitting bonus:', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// HR: Get all bonuses
app.get('/api/hr/bonuses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, employeeId, name, email, bonusAmount::FLOAT AS bonusAmount, month, reason, createdAt FROM bonus ORDER BY createdAt DESC');
    console.log('Fetched bonuses:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching bonuses:', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Employee: Check bonus
app.post('/api/employee/check-bonus', async (req, res) => {
  const { employeeId, month } = req.body;

  if (!employeeId || !employeeId.match(/^ATS0\d{3}$/i)) {
    return res.status(400).json({ message: 'Invalid Employee ID. Must be in format ATS0XXX.' });
  }
  if (!month || !month.match(/^\d{4}-\d{2}$/)) {
    return res.status(400).json({ message: 'Invalid month format. Use YYYY-MM.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, employeeId, name, bonusAmount::FLOAT AS bonusAmount, month, reason FROM bonus WHERE UPPER(employeeId) = $1 AND month = $2',
      [employeeId.toUpperCase(), month]
    );

    if (rows.length === 0) {
      console.log(`No bonus found for employeeId: ${employeeId}, month: ${month}`);
      return res.status(404).json({ message: 'No bonuses found for this month.' });
    }

    res.json(rows);
  } catch (err) {
    console.error('Error checking bonus:', err.message);
    res.status(500).json({ message: 'Server error.' });
  }
});

// Generate Professional PDF Bonus Slip
app.get('/api/bonus/pdf/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, employeeId, name, email, bonusAmount::FLOAT AS bonusAmount, month, reason FROM bonus WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Bonus not found.' });
    }

    const bonus = rows[0];
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const fileName = `Astrolite Tech Solutions Bonus_Slip_${bonus.employeeId}_${bonus.month}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    doc.pipe(res);

    const logoPath = './Bonus_AjayKumar/Upload/logo.png';
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 45, { width: 50 });
    } else {
      console.warn('Logo file not found, skipping image.');
      doc.fontSize(10)
         .fillColor('#444444')
         .text('Logo not available', 50, 45);
    }

    doc.fillColor('#444444')
       .fontSize(20)
       .text('AStrolite Tech Solutions', 110, 50)
       .fontSize(10)
       .text('Hyderabad Branch', 110, 75)
       .moveDown();

    doc.fontSize(16)
       .fillColor('#5f1aff')
       .text('BONUS PAYMENT SLIP', { align: 'center' })
       .moveDown();

    doc.strokeColor('#aaaaaa')
       .lineWidth(1)
       .moveTo(50, 120)
       .lineTo(550, 120)
       .stroke();

    doc.fontSize(12)
       .fillColor('#333333')
       .text(`Employee ID: ${bonus.employeeId || 'N/A'}`, 50, 140)
       .text(`Employee Name: ${bonus.name || 'N/A'}`, 50, 160)
       .text(`Month: ${bonus.month ? new Date(bonus.month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' }) : 'N/A'}`, 50, 180)
       .moveDown();

    doc.rect(50, 220, 500, 100)
       .fill('#f8f9fa')
       .stroke('#e0e0e0')
       .fillAndStroke();

    doc.fontSize(14)
       .fillColor('#5f1aff')
       .text('BONUS DETAILS', 60, 230);

    doc.fontSize(12)
       .fillColor('#333333')
       .text(`Amount: ₹${bonus.bonusAmount != null ? bonus.bonusAmount.toFixed(2) : '0.00'}`, 60, 260)
       .text(`Reason: ${bonus.reason || 'N/A'}`, 60, 280)
       .moveDown();

    doc.fontSize(10)
       .fillColor('#777777')
       .text('This is an official document from Astrolite Tech Solutions, Hyderabad Branch.', 50, 350, { align: 'center' })
       .text('Generated on: ' + new Date().toLocaleDateString(), 50, 370, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Error generating PDF:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error generating PDF.' });
    }
  }
});

// Start server
initializeDatabase().then(() => {
  app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
  });
}).catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
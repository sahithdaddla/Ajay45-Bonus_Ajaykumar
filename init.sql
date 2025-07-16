-- Create the bonuses table
CREATE TABLE IF NOT EXISTS bonuses (
    bonus_id VARCHAR(10) PRIMARY KEY,
    employee_id VARCHAR(7) NOT NULL,
    employee_name VARCHAR(40) NOT NULL,
    employee_email VARCHAR(40) NOT NULL,
    bonus_type VARCHAR(20) NOT NULL CHECK (bonus_type IN ('Performance', 'Festival', 'Project Completion', 'Retention', 'Referral')),
    amount DECIMAL(10, 2) NOT NULL,
    month_year DATE NOT NULL,
    reason VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data (optional, for testing)
INSERT INTO bonuses (
    bonus_id, employee_id, employee_name, employee_email,
    bonus_type, amount, month_year, reason
) VALUES
    ('BON0001', 'ATS0143', 'John Doe', 'john.doe@astrolitetech.com',
     'Performance', 5000.00, '2025-06-01', 'Excellent Q2 performance'),
    ('BON0002', 'ATS0143', 'John Doe', 'john.doe@astrolitetech.com',
     'Festival', 3000.00, '2025-06-01', 'Diwali bonus');

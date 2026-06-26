-- Database Initialization Schema for RaktSetu (PostgreSQL Version)

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('recipient', 'donor', 'hospital_blood_bank', 'admin')),
  full_name VARCHAR(100) NULL,
  blood_group VARCHAR(10) NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-')),
  age INT NULL,
  gender VARCHAR(20) NULL,
  location_name VARCHAR(255) NULL,
  latitude DECIMAL(10, 8) NULL,
  longitude DECIMAL(11, 8) NULL,
  last_donation_date DATE NULL,
  emergency_contact VARCHAR(20) NULL,
  is_profile_completed BOOLEAN DEFAULT FALSE,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT phone_role_unique UNIQUE (phone_number, role)
);

-- 2. OTPs Table
CREATE TABLE IF NOT EXISTS otps (
  id SERIAL PRIMARY KEY,
  phone_number VARCHAR(20) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('recipient', 'donor', 'hospital_blood_bank', 'admin')),
  otp_code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Blood Requests Table
CREATE TABLE IF NOT EXISTS blood_requests (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  blood_group VARCHAR(10) NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-')),
  units_required INT DEFAULT 1,
  hospital_name VARCHAR(255) NOT NULL,
  location_name VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  is_emergency BOOLEAN DEFAULT FALSE,
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 4. Blood Request Responses Table
CREATE TABLE IF NOT EXISTS blood_request_responses (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL,
  donor_id INT NOT NULL,
  status VARCHAR(20) DEFAULT 'interested' CHECK (status IN ('interested', 'donated', 'declined')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT request_donor_unique UNIQUE (request_id, donor_id),
  FOREIGN KEY (request_id) REFERENCES blood_requests (id) ON DELETE CASCADE,
  FOREIGN KEY (donor_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 5. Blood Bank Stocks Table
CREATE TABLE IF NOT EXISTS blood_bank_stocks (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  blood_group VARCHAR(10) NOT NULL CHECK (blood_group IN ('A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-')),
  units_in_stock INT DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_blood_group_unique UNIQUE (user_id, blood_group),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Send OTP to phone number
exports.sendOtp = async (req, res) => {
  try {
    const { phone_number, role } = req.body;

    // Validation
    if (!phone_number || !role) {
      return res.status(400).json({ error: 'Phone number and role are required.' });
    }

    const validRoles = ['recipient', 'donor', 'hospital_blood_bank', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be recipient, donor, hospital_blood_bank, or admin.' });
    }

    // Generate a 6-digit OTP (static 123456)
    const otpCode = '123456';
    
    // Set expiry to 5 minutes from now
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Insert into DB
    const query = `
      INSERT INTO otps (phone_number, role, otp_code, expires_at)
      VALUES (?, ?, ?, ?)
    `;
    await db.query(query, [phone_number, role, otpCode, expiresAt]);

    // Simulate sending OTP (log to console)
    console.log(`[SMS MOCK] Sent OTP ${otpCode} to ${phone_number} for role ${role}`);

    // Response structure
    const responseData = {
      message: 'OTP sent successfully.'
    };

    // Expose OTP in development mode for easy testing
    if (process.env.NODE_ENV !== 'production') {
      responseData.otp_code = otpCode;
      responseData.note = 'Development mode: OTP returned in response body for testing';
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error sending OTP:', error);
    return res.status(500).json({ error: 'Failed to send OTP.' });
  }
};

// Verify OTP
exports.verifyOtp = async (req, res) => {
  try {
    const { phone_number, role, otp_code } = req.body;

    // Validation
    if (!phone_number || !role || !otp_code) {
      return res.status(400).json({ error: 'Phone number, role, and OTP code are required.' });
    }

    // Check if OTP matches and is not expired
    const otpQuery = `
      SELECT * FROM otps 
      WHERE phone_number = ? AND role = ? AND otp_code = ? AND expires_at > NOW()
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const [otps] = await db.query(otpQuery, [phone_number, role, otp_code]);

    if (otps.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP.' });
    }

    // OTP verified, clean up OTPs for this phone/role
    const deleteQuery = 'DELETE FROM otps WHERE phone_number = ? AND role = ?';
    await db.query(deleteQuery, [phone_number, role]);

    // Check if user exists
    const userQuery = 'SELECT * FROM users WHERE phone_number = ? AND role = ?';
    const [users] = await db.query(userQuery, [phone_number, role]);

    let user;
    if (users.length === 0) {
      // Register new user (profile not completed)
      const insertUserQuery = `
        INSERT INTO users (phone_number, role, is_profile_completed)
        VALUES (?, ?, FALSE)
      `;
      const [insertResult] = await db.query(insertUserQuery, [phone_number, role]);
      
      // Fetch the newly created user
      const [newUser] = await db.query('SELECT * FROM users WHERE id = ?', [insertResult.insertId]);
      user = newUser[0];
    } else {
      user = users[0];
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        phone_number: user.phone_number,
        role: user.role
      },
      process.env.JWT_SECRET || 'supersecretjwtkeyforraktsetuapp2026',
      { expiresIn: '30d' } // Token valid for 30 days
    );

    return res.status(200).json({
      message: 'Authentication successful.',
      token,
      isProfileCompleted: !!user.is_profile_completed,
      user: {
        id: user.id,
        phone_number: user.phone_number,
        role: user.role,
        full_name: user.full_name,
        blood_group: user.blood_group,
        is_profile_completed: !!user.is_profile_completed
      }
    });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return res.status(500).json({ error: 'Failed to verify OTP.' });
  }
};

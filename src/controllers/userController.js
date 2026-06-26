const db = require('../config/db');

// Helper to format date to YYYY-MM-DD for MySQL
const formatMySQLDate = (dateString) => {
  if (!dateString) return null;
  const parsedDate = new Date(dateString);
  if (isNaN(parsedDate.getTime())) return null;
  return parsedDate.toISOString().slice(0, 10);
};

// Helper to compute donor eligibility
const getEligibilityDetails = (lastDonationDate) => {
  if (!lastDonationDate) {
    return {
      is_eligible: true,
      days_until_eligible: 0,
      message: "You're eligible to donate. No previous donation recorded."
    };
  }
  
  const lastDonation = new Date(lastDonationDate);
  const today = new Date();
  
  // Calculate difference in days
  const diffTime = today - lastDonation;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 90) {
    return {
      is_eligible: true,
      days_until_eligible: 0,
      message: "You're eligible to donate. Last donation was over 90 days ago."
    };
  } else {
    const daysRemaining = 90 - diffDays;
    return {
      is_eligible: false,
      days_until_eligible: daysRemaining,
      message: `Next eligible to donate in ${daysRemaining} days.`
    };
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      full_name,
      blood_group,
      age,
      gender,
      location_name,
      latitude,
      longitude,
      last_donation_date,
      emergency_contact
    } = req.body;

    // Validate name
    if (!full_name) {
      return res.status(400).json({ error: 'Full name is required.' });
    }

    // Validate blood group if donor or recipient
    const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
    if ((req.user.role === 'donor' || req.user.role === 'recipient') && !blood_group) {
      return res.status(400).json({ error: 'Blood group is required.' });
    }
    if (blood_group && !validBloodGroups.includes(blood_group)) {
      return res.status(400).json({ error: 'Invalid blood group.' });
    }

    // Format last donation date
    const formattedDonationDate = formatMySQLDate(last_donation_date);

    // Update users table
    const updateQuery = `
      UPDATE users 
      SET 
        full_name = ?,
        blood_group = ?,
        age = ?,
        gender = ?,
        location_name = ?,
        latitude = ?,
        longitude = ?,
        last_donation_date = ?,
        emergency_contact = ?,
        is_profile_completed = TRUE
      WHERE id = ?
    `;

    await db.query(updateQuery, [
      full_name,
      blood_group || null,
      age ? parseInt(age, 10) : null,
      gender || null,
      location_name || null,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      formattedDonationDate,
      emergency_contact || null,
      userId
    ]);

    // If user is a hospital/blood bank, auto-initialize stocks if not already initialized
    if (req.user.role === 'hospital_blood_bank') {
      const stockCheckQuery = 'SELECT COUNT(*) as count FROM blood_bank_stocks WHERE user_id = ?';
      const [[{ count }]] = await db.query(stockCheckQuery, [userId]);

      if (count === 0) {
        console.log(`Initializing blood bank stock database entries for hospital ID ${userId}`);
        const insertStockQuery = `
          INSERT INTO blood_bank_stocks (user_id, blood_group, units_in_stock)
          VALUES 
            (?, 'A+', 0), (?, 'A-', 0), (?, 'B+', 0), (?, 'B-', 0),
            (?, 'O+', 0), (?, 'O-', 0), (?, 'AB+', 0), (?, 'AB-', 0)
        `;
        await db.query(insertStockQuery, [
          userId, userId, userId, userId,
          userId, userId, userId, userId
        ]);
      }
    }

    // Retrieve updated profile
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    const updatedUser = users[0];

    return res.status(200).json({
      message: 'Profile updated successfully.',
      user: {
        id: updatedUser.id,
        phone_number: updatedUser.phone_number,
        role: updatedUser.role,
        full_name: updatedUser.full_name,
        blood_group: updatedUser.blood_group,
        age: updatedUser.age,
        gender: updatedUser.gender,
        location_name: updatedUser.location_name,
        latitude: updatedUser.latitude,
        longitude: updatedUser.longitude,
        last_donation_date: updatedUser.last_donation_date,
        emergency_contact: updatedUser.emergency_contact,
        is_profile_completed: !!updatedUser.is_profile_completed,
        is_available: !!updatedUser.is_available,
        eligibility: updatedUser.role === 'donor' ? getEligibilityDetails(updatedUser.last_donation_date) : null
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
};

// Get current user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = users[0];
    return res.status(200).json({
      user: {
        id: user.id,
        phone_number: user.phone_number,
        role: user.role,
        full_name: user.full_name,
        blood_group: user.blood_group,
        age: user.age,
        gender: user.gender,
        location_name: user.location_name,
        latitude: user.latitude,
        longitude: user.longitude,
        last_donation_date: user.last_donation_date,
        emergency_contact: user.emergency_contact,
        is_profile_completed: !!user.is_profile_completed,
        is_available: !!user.is_available,
        eligibility: user.role === 'donor' ? getEligibilityDetails(user.last_donation_date) : null
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({ error: 'Failed to fetch profile.' });
  }
};

// Update donor availability status
exports.updateAvailability = async (req, res) => {
  try {
    const userId = req.user.id;
    const { is_available } = req.body;

    if (is_available === undefined) {
      return res.status(400).json({ error: 'Availability flag (is_available) is required.' });
    }

    const updateQuery = 'UPDATE users SET is_available = ? WHERE id = ?';
    await db.query(updateQuery, [is_available ? 1 : 0, userId]);

    return res.status(200).json({
      message: 'Availability status updated successfully.',
      is_available: !!is_available
    });
  } catch (error) {
    console.error('Error updating availability:', error);
    return res.status(500).json({ error: 'Failed to update availability status.' });
  }
};

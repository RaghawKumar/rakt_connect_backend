const db = require('../config/db');

// helper for date formatting
const formatMySQLDate = (dateString) => {
  if (!dateString) return null;
  const parsedDate = new Date(dateString);
  if (isNaN(parsedDate.getTime())) return null;
  return parsedDate.toISOString().slice(0, 10);
};

// 1. Dashboard Statistics
exports.getStats = async (req, res) => {
  try {
    // Counts by role
    const roleCountsQuery = `
      SELECT role, COUNT(*) as count 
      FROM users 
      GROUP BY role
    `;
    const [roleCounts] = await db.query(roleCountsQuery);
    
    // Requests by status
    const statusCountsQuery = `
      SELECT status, COUNT(*) as count 
      FROM blood_requests 
      GROUP BY status
    `;
    const [statusCounts] = await db.query(statusCountsQuery);

    // Requests by priority
    const priorityCountsQuery = `
      SELECT priority, COUNT(*) as count 
      FROM blood_requests 
      GROUP BY priority
    `;
    const [priorityCounts] = await db.query(priorityCountsQuery);

    // Total stock units
    const totalStockQuery = `
      SELECT SUM(units_in_stock) as total_stock 
      FROM blood_bank_stocks
    `;
    const [[{ total_stock }]] = await db.query(totalStockQuery);

    // Recent activity (Last 5 users)
    const recentUsersQuery = `
      SELECT id, phone_number, role, full_name, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    const [recentUsers] = await db.query(recentUsersQuery);

    // Recent activity (Last 5 blood requests)
    const recentRequestsQuery = `
      SELECT id, patient_name, blood_group, units_required, hospital_name, is_emergency, priority, status, created_at 
      FROM blood_requests 
      ORDER BY created_at DESC 
      LIMIT 5
    `;
    const [recentRequests] = await db.query(recentRequestsQuery);

    // Aggregate statistics
    const stats = {
      users: {
        total: roleCounts.reduce((acc, curr) => acc + curr.count, 0),
        donor: (roleCounts.find(r => r.role === 'donor') || { count: 0 }).count,
        recipient: (roleCounts.find(r => r.role === 'recipient') || { count: 0 }).count,
        hospital_blood_bank: (roleCounts.find(r => r.role === 'hospital_blood_bank') || { count: 0 }).count,
        admin: (roleCounts.find(r => r.role === 'admin') || { count: 0 }).count,
      },
      requests: {
        total: statusCounts.reduce((acc, curr) => acc + curr.count, 0),
        active: (statusCounts.find(s => s.status === 'active') || { count: 0 }).count,
        completed: (statusCounts.find(s => s.status === 'completed') || { count: 0 }).count,
        cancelled: (statusCounts.find(s => s.status === 'cancelled') || { count: 0 }).count,
      },
      priorities: {
        low: (priorityCounts.find(p => p.priority === 'low') || { count: 0 }).count,
        medium: (priorityCounts.find(p => p.priority === 'medium') || { count: 0 }).count,
        high: (priorityCounts.find(p => p.priority === 'high') || { count: 0 }).count,
        critical: (priorityCounts.find(p => p.priority === 'critical') || { count: 0 }).count,
      },
      totalStock: total_stock || 0,
      recentUsers,
      recentRequests
    };

    return res.status(200).json({ stats });
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics.' });
  }
};

// 2. User Management
exports.getUsers = async (req, res) => {
  try {
    const [users] = await db.query('SELECT * FROM users ORDER BY created_at DESC');
    return res.status(200).json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name,
      role,
      blood_group,
      age,
      gender,
      location_name,
      latitude,
      longitude,
      last_donation_date,
      emergency_contact,
      is_available
    } = req.body;

    const formattedDonationDate = formatMySQLDate(last_donation_date);

    const updateQuery = `
      UPDATE users 
      SET 
        full_name = ?,
        role = ?,
        blood_group = ?,
        age = ?,
        gender = ?,
        location_name = ?,
        latitude = ?,
        longitude = ?,
        last_donation_date = ?,
        emergency_contact = ?,
        is_available = ?
      WHERE id = ?
    `;

    await db.query(updateQuery, [
      full_name || null,
      role,
      blood_group || null,
      age ? parseInt(age, 10) : null,
      gender || null,
      location_name || null,
      latitude ? parseFloat(latitude) : null,
      longitude ? parseFloat(longitude) : null,
      formattedDonationDate,
      emergency_contact || null,
      is_available !== undefined ? (is_available ? true : false) : true,
      id
    ]);

    // Retrieve updated user details
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({
      message: 'User updated successfully.',
      user: users[0]
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Failed to update user.' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevention: Admin shouldn't delete themselves easily
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own admin account.' });
    }

    const [result] = await db.query('DELETE FROM users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({ message: 'User deleted successfully.' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
};

// 3. Blood Request Management
exports.getBloodRequests = async (req, res) => {
  try {
    const query = `
      SELECT br.*, u.phone_number as requester_phone, u.full_name as requester_name 
      FROM blood_requests br
      JOIN users u ON br.user_id = u.id
      ORDER BY br.created_at DESC
    `;
    const [requests] = await db.query(query);
    return res.status(200).json({ requests });
  } catch (error) {
    console.error('Error fetching blood requests:', error);
    return res.status(500).json({ error: 'Failed to fetch blood requests.' });
  }
};

exports.updateBloodRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      patient_name,
      blood_group,
      units_required,
      hospital_name,
      location_name,
      latitude,
      longitude,
      is_emergency,
      priority,
      status
    } = req.body;

    const updateQuery = `
      UPDATE blood_requests 
      SET 
        patient_name = ?,
        blood_group = ?,
        units_required = ?,
        hospital_name = ?,
        location_name = ?,
        latitude = ?,
        longitude = ?,
        is_emergency = ?,
        priority = ?,
        status = ?
      WHERE id = ?
    `;

    await db.query(updateQuery, [
      patient_name,
      blood_group,
      units_required ? parseInt(units_required, 10) : 1,
      hospital_name,
      location_name,
      latitude ? parseFloat(latitude) : 0,
      longitude ? parseFloat(longitude) : 0,
      is_emergency !== undefined ? (is_emergency ? true : false) : false,
      priority || 'medium',
      status || 'active',
      id
    ]);

    const [requests] = await db.query('SELECT * FROM blood_requests WHERE id = ?', [id]);
    if (requests.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    return res.status(200).json({
      message: 'Blood request updated successfully.',
      request: requests[0]
    });
  } catch (error) {
    console.error('Error updating blood request:', error);
    return res.status(500).json({ error: 'Failed to update blood request.' });
  }
};

exports.deleteBloodRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('DELETE FROM blood_requests WHERE id = ?', [id]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    return res.status(200).json({ message: 'Blood request deleted successfully.' });
  } catch (error) {
    console.error('Error deleting blood request:', error);
    return res.status(500).json({ error: 'Failed to delete blood request.' });
  }
};

// 4. Blood Bank Stock Management
exports.getStocks = async (req, res) => {
  try {
    const query = `
      SELECT bbs.*, u.full_name as hospital_name, u.location_name, u.phone_number 
      FROM blood_bank_stocks bbs
      JOIN users u ON bbs.user_id = u.id
      ORDER BY u.full_name ASC, bbs.blood_group ASC
    `;
    const [stocks] = await db.query(query);
    return res.status(200).json({ stocks });
  } catch (error) {
    console.error('Error fetching blood bank stocks:', error);
    return res.status(500).json({ error: 'Failed to fetch blood bank stocks.' });
  }
};

exports.updateStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { units_in_stock } = req.body;

    if (units_in_stock === undefined || units_in_stock < 0) {
      return res.status(400).json({ error: 'Valid units_in_stock (0 or positive integer) is required.' });
    }

    const updateQuery = 'UPDATE blood_bank_stocks SET units_in_stock = ? WHERE id = ?';
    await db.query(updateQuery, [parseInt(units_in_stock, 10), id]);

    const [stocks] = await db.query('SELECT * FROM blood_bank_stocks WHERE id = ?', [id]);
    if (stocks.length === 0) {
      return res.status(404).json({ error: 'Stock record not found.' });
    }

    return res.status(200).json({
      message: 'Stock updated successfully.',
      stock: stocks[0]
    });
  } catch (error) {
    console.error('Error updating blood stock:', error);
    return res.status(500).json({ error: 'Failed to update blood stock.' });
  }
};

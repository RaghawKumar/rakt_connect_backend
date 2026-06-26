const db = require('../config/db');

// Create a new blood request
exports.createRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      patient_name,
      blood_group,
      units_required,
      hospital_name,
      location_name,
      latitude,
      longitude,
      is_emergency,
      priority
    } = req.body;

    // Validation
    if (!patient_name || !blood_group || !hospital_name || !location_name || !latitude || !longitude) {
      return res.status(400).json({ error: 'All fields (patient_name, blood_group, hospital_name, location_name, latitude, longitude) are required.' });
    }

    const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
    if (!validBloodGroups.includes(blood_group)) {
      return res.status(400).json({ error: 'Invalid blood group.' });
    }

    // Determine priority
    let selectedPriority = 'medium';
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (priority && validPriorities.includes(priority.toLowerCase())) {
      selectedPriority = priority.toLowerCase();
    } else if (is_emergency) {
      selectedPriority = 'critical';
    }

    const insertQuery = `
      INSERT INTO blood_requests 
        (user_id, patient_name, blood_group, units_required, hospital_name, location_name, latitude, longitude, is_emergency, priority, status)
      VALUES 
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;

    const [result] = await db.query(insertQuery, [
      userId,
      patient_name,
      blood_group,
      units_required || 1,
      hospital_name,
      location_name,
      parseFloat(latitude),
      parseFloat(longitude),
      is_emergency ? 1 : 0,
      selectedPriority
    ]);

    // Fetch the created request
    const [requests] = await db.query('SELECT * FROM blood_requests WHERE id = ?', [result.insertId]);

    return res.status(201).json({
      message: 'Blood request created successfully.',
      request: requests[0]
    });
  } catch (error) {
    console.error('Error creating blood request:', error);
    return res.status(500).json({ error: 'Failed to create blood request.' });
  }
};

// Get requests based on user role
exports.getRequests = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    if (role === 'donor') {
      // Donors see active requests, option to filter/sort by proximity
      let lat = req.query.latitude ? parseFloat(req.query.latitude) : null;
      let lng = req.query.longitude ? parseFloat(req.query.longitude) : null;
      const radius = req.query.radius ? parseFloat(req.query.radius) : 10; // Default 10km limit if radius is specified but no lat/lng, we can ignore

      // If lat/lng are not passed in query, try to get from donor profile
      if (!lat || !lng) {
        const [users] = await db.query('SELECT latitude, longitude FROM users WHERE id = ?', [userId]);
        if (users.length > 0 && users[0].latitude && users[0].longitude) {
          lat = parseFloat(users[0].latitude);
          lng = parseFloat(users[0].longitude);
        }
      }

      let query;
      let params = [];

      if (lat && lng) {
        // Haversine formula to compute distance in KM
        // 6371 * acos(cos(rad(lat)) * cos(rad(r.lat)) * cos(rad(r.lng) - rad(lng)) + sin(rad(lat)) * sin(rad(r.lat)))
        query = `
          SELECT 
            br.*,
            u.full_name AS requester_name,
            (6371 * acos(
              cos(radians(?)) * cos(radians(br.latitude)) * 
              cos(radians(br.longitude) - radians(?)) + 
              sin(radians(?)) * sin(radians(br.latitude))
            )) AS distance_km,
            (SELECT COUNT(*) FROM blood_request_responses WHERE request_id = br.id) AS donor_response_count,
            (SELECT COUNT(*) FROM blood_request_responses WHERE request_id = br.id AND donor_id = ?) AS has_responded
          FROM blood_requests br
          JOIN users u ON br.user_id = u.id
          WHERE br.status = 'active'
          HAVING distance_km <= ?
          ORDER BY distance_km ASC
        `;
        params = [lat, lng, lat, userId, radius];
      } else {
        // Fallback: no coordinates available, just return all active requests
        query = `
          SELECT 
            br.*,
            u.full_name AS requester_name,
            0 AS distance_km,
            (SELECT COUNT(*) FROM blood_request_responses WHERE request_id = br.id) AS donor_response_count,
            (SELECT COUNT(*) FROM blood_request_responses WHERE request_id = br.id AND donor_id = ?) AS has_responded
          FROM blood_requests br
          JOIN users u ON br.user_id = u.id
          WHERE br.status = 'active'
          ORDER BY br.created_at DESC
        `;
        params = [userId];
      }

      const [requests] = await db.query(query, params);
      return res.status(200).json({ requests });

    } else {
      // Recipients and hospitals see their own requests
      const query = `
        SELECT 
          br.*,
          (SELECT COUNT(*) FROM blood_request_responses WHERE request_id = br.id) AS donor_response_count
        FROM blood_requests br
        WHERE br.user_id = ?
        ORDER BY br.created_at DESC
      `;
      const [requests] = await db.query(query, [userId]);
      return res.status(200).json({ requests });
    }
  } catch (error) {
    console.error('Error fetching blood requests:', error);
    return res.status(500).json({ error: 'Failed to fetch blood requests.' });
  }
};

// Respond/express interest in a request (Donor only)
exports.respondToRequest = async (req, res) => {
  try {
    const donorId = req.user.id;
    const requestId = req.params.id;

    if (req.user.role !== 'donor') {
      return res.status(403).json({ error: 'Only donors can respond to blood requests.' });
    }

    // Verify the request is active
    const checkQuery = "SELECT status FROM blood_requests WHERE id = ?";
    const [requests] = await db.query(checkQuery, [requestId]);

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    if (requests[0].status !== 'active') {
      return res.status(400).json({ error: 'This blood request is no longer active.' });
    }

    // Insert response
    const insertResponseQuery = `
      INSERT INTO blood_request_responses (request_id, donor_id, status)
      VALUES (?, ?, 'interested')
      ON DUPLICATE KEY UPDATE status = 'interested'
    `;
    await db.query(insertResponseQuery, [requestId, donorId]);

    return res.status(200).json({
      message: 'You have successfully responded to this blood request. The requester will be notified.'
    });
  } catch (error) {
    console.error('Error responding to blood request:', error);
    return res.status(500).json({ error: 'Failed to respond to blood request.' });
  }
};

// Update request status (Owner only)
exports.updateRequestStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['active', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be active, completed, or cancelled.' });
    }

    // Verify ownership
    const checkOwnershipQuery = 'SELECT user_id FROM blood_requests WHERE id = ?';
    const [requests] = await db.query(checkOwnershipQuery, [requestId]);

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    if (requests[0].user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to update this request.' });
    }

    // Update status
    const updateQuery = 'UPDATE blood_requests SET status = ? WHERE id = ?';
    await db.query(updateQuery, [status, requestId]);

    return res.status(200).json({
      message: `Request status updated to ${status} successfully.`,
      request_id: requestId,
      status
    });
  } catch (error) {
    console.error('Error updating blood request status:', error);
    return res.status(500).json({ error: 'Failed to update request status.' });
  }
};

// Get responses for a request (Owner only)
exports.getRequestResponses = async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = req.params.id;

    // Verify ownership
    const checkOwnershipQuery = 'SELECT user_id FROM blood_requests WHERE id = ?';
    const [requests] = await db.query(checkOwnershipQuery, [requestId]);

    if (requests.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    if (requests[0].user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to view responses for this request.' });
    }

    const responsesQuery = `
      SELECT 
        brr.id AS response_id,
        brr.status AS response_status,
        brr.created_at AS responded_at,
        u.id AS donor_id,
        u.full_name,
        u.phone_number,
        u.blood_group,
        u.age,
        u.gender,
        u.location_name,
        (6371 * acos(
          cos(radians(br.latitude)) * cos(radians(u.latitude)) * 
          cos(radians(u.longitude) - radians(br.longitude)) + 
          sin(radians(br.latitude)) * sin(radians(u.latitude))
        )) AS distance_km
      FROM blood_request_responses brr
      JOIN users u ON brr.donor_id = u.id
      JOIN blood_requests br ON brr.request_id = br.id
      WHERE brr.request_id = ?
      ORDER BY brr.created_at DESC
    `;
    const [rows] = await db.query(responsesQuery, [requestId]);

    // Format the distances
    const responses = rows.map(row => ({
      response_id: row.response_id,
      response_status: row.response_status,
      responded_at: row.responded_at,
      donor_id: row.donor_id,
      full_name: row.full_name,
      phone_number: row.phone_number,
      blood_group: row.blood_group,
      age: row.age,
      gender: row.gender,
      location_name: row.location_name,
      distance_km: row.distance_km ? parseFloat(parseFloat(row.distance_km).toFixed(1)) : 0
    }));

    return res.status(200).json({ responses });
  } catch (error) {
    console.error('Error fetching responses:', error);
    return res.status(500).json({ error: 'Failed to fetch responses.' });
  }
};

// Get nearby matching donors for a blood request (to show notified / available donors)
exports.getMatchingDonors = async (req, res) => {
  try {
    const userId = req.user.id;
    const requestId = req.params.id;

    // 1. Fetch request details
    const [requests] = await db.query('SELECT * FROM blood_requests WHERE id = ?', [requestId]);
    if (requests.length === 0) {
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    const request = requests[0];

    // Ensure only the request owner can see this
    if (request.user_id !== userId) {
      return res.status(403).json({ error: 'You do not have permission to view matching donors for this request.' });
    }

    // 2. Query donors matching the blood group within 10km
    // Haversine formula to calculate distance
    const donorQuery = `
      SELECT 
        u.id AS donor_id,
        u.full_name,
        u.phone_number,
        u.blood_group,
        u.age,
        u.gender,
        u.location_name,
        (6371 * acos(
          cos(radians(?)) * cos(radians(u.latitude)) * 
          cos(radians(u.longitude) - radians(?)) + 
          sin(radians(?)) * sin(radians(u.latitude))
        )) AS distance_km
      FROM users u
      WHERE u.role = 'donor' 
        AND u.blood_group = ? 
        AND u.is_profile_completed = TRUE
      HAVING distance_km <= 10
      ORDER BY distance_km ASC
    `;

    const [donors] = await db.query(donorQuery, [
      parseFloat(request.latitude),
      parseFloat(request.longitude),
      parseFloat(request.latitude),
      request.blood_group
    ]);

    // Format the distances
    const formattedDonors = donors.map(donor => ({
      donor_id: donor.donor_id,
      full_name: donor.full_name,
      phone_number: donor.phone_number,
      blood_group: donor.blood_group,
      age: donor.age,
      gender: donor.gender,
      location_name: donor.location_name,
      distance_km: parseFloat(parseFloat(donor.distance_km).toFixed(1))
    }));

    return res.status(200).json({
      request: {
        id: request.id,
        blood_group: request.blood_group,
        units_required: request.units_required,
        is_emergency: !!request.is_emergency
      },
      notified_count: formattedDonors.length,
      matching_donors: formattedDonors
    });
  } catch (error) {
    console.error('Error fetching matching donors:', error);
    return res.status(500).json({ error: 'Failed to fetch matching donors.' });
  }
};
// Mark donation completed (Donor only)
exports.completeDonation = async (req, res) => {
  try {
    const donorId = req.user.id;
    const requestId = req.params.id;

    if (req.user.role !== 'donor') {
      return res.status(403).json({ error: 'Only donors can complete donations.' });
    }

    // 1. Verify response exists
    const checkQuery = `
      SELECT * FROM blood_request_responses 
      WHERE request_id = ? AND donor_id = ?
    `;
    const [responses] = await db.query(checkQuery, [requestId, donorId]);

    if (responses.length === 0) {
      return res.status(404).json({ error: 'No active response found for this blood request.' });
    }

    // 2. Update response status to 'donated'
    const updateResponseQuery = `
      UPDATE blood_request_responses 
      SET status = 'donated' 
      WHERE request_id = ? AND donor_id = ?
    `;
    await db.query(updateResponseQuery, [requestId, donorId]);

    // 3. Automatically update donor's last donation date to today
    const updateDonorQuery = `
      UPDATE users 
      SET last_donation_date = CURRENT_DATE() 
      WHERE id = ?
    `;
    await db.query(updateDonorQuery, [donorId]);

    // 3.5. Update blood request status to 'completed'
    const updateRequestQuery = `
      UPDATE blood_requests 
      SET status = 'completed' 
      WHERE id = ?
    `;
    await db.query(updateRequestQuery, [requestId]);

    // 4. Calculate stats (Lifetime donations and lives impacted)
    const statsQuery = `
      SELECT COUNT(*) as lifetime_donations 
      FROM blood_request_responses 
      WHERE donor_id = ? AND status = 'donated'
    `;
    const [[{ lifetime_donations }]] = await db.query(statsQuery, [donorId]);
    const lives_impacted = lifetime_donations * 3;

    return res.status(200).json({
      message: 'Donation completed successfully. Thank you for saving lives!',
      stats: {
        lifetime_donations,
        lives_impacted,
        resting_message: "You're now resting. Eligible to donate again in ~90 days."
      }
    });
  } catch (error) {
    console.error('Error completing donation:', error);
    return res.status(500).json({ error: 'Failed to complete donation.' });
  }
};

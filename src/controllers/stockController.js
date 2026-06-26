const db = require('../config/db');

// Update blood stock (Hospital/Blood Bank only)
exports.updateStock = async (req, res) => {
  try {
    const userId = req.user.id;

    if (req.user.role !== 'hospital_blood_bank') {
      return res.status(403).json({ error: 'Only hospitals/blood banks can update stock.' });
    }

    const { blood_group, units_in_stock, stocks } = req.body;

    const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

    if (stocks && Array.isArray(stocks)) {
      // Bulk update
      console.log(`Processing bulk stock update for hospital ${userId}`);
      for (const item of stocks) {
        const { blood_group: bg, units_in_stock: units } = item;
        if (validBloodGroups.includes(bg) && units !== undefined) {
          const updateQuery = `
            INSERT INTO blood_bank_stocks (user_id, blood_group, units_in_stock)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE units_in_stock = VALUES(units_in_stock)
          `;
          await db.query(updateQuery, [userId, bg, parseInt(units, 10)]);
        }
      }
    } else if (blood_group && units_in_stock !== undefined) {
      // Single update
      if (!validBloodGroups.includes(blood_group)) {
        return res.status(400).json({ error: 'Invalid blood group.' });
      }

      const updateQuery = `
        INSERT INTO blood_bank_stocks (user_id, blood_group, units_in_stock)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE units_in_stock = VALUES(units_in_stock)
      `;
      await db.query(updateQuery, [userId, blood_group, parseInt(units_in_stock, 10)]);
    } else {
      return res.status(400).json({ error: 'Please provide blood_group and units_in_stock, or a stocks array.' });
    }

    // Retrieve updated stock list
    const [updatedStocks] = await db.query(
      'SELECT blood_group, units_in_stock, last_updated FROM blood_bank_stocks WHERE user_id = ? ORDER BY blood_group',
      [userId]
    );

    return res.status(200).json({
      message: 'Blood stock updated successfully.',
      stocks: updatedStocks
    });
  } catch (error) {
    console.error('Error updating blood stock:', error);
    return res.status(500).json({ error: 'Failed to update blood stock.' });
  }
};

// Get stock details for the logged-in hospital/blood bank
exports.getMyStock = async (req, res) => {
  try {
    const userId = req.user.id;

    if (req.user.role !== 'hospital_blood_bank') {
      return res.status(403).json({ error: 'Only hospitals/blood banks can view their stock directly.' });
    }

    const [stocks] = await db.query(
      'SELECT blood_group, units_in_stock, last_updated FROM blood_bank_stocks WHERE user_id = ? ORDER BY blood_group',
      [userId]
    );

    return res.status(200).json({ stocks });
  } catch (error) {
    console.error('Error fetching stock:', error);
    return res.status(500).json({ error: 'Failed to fetch stock.' });
  }
};

// Find nearby blood banks (For Donors and Recipients)
exports.getNearbyBloodBanks = async (req, res) => {
  try {
    const userId = req.user.id;
    let lat = req.query.latitude ? parseFloat(req.query.latitude) : null;
    let lng = req.query.longitude ? parseFloat(req.query.longitude) : null;
    const radius = req.query.radius ? parseFloat(req.query.radius) : 15; // default 15km

    // If coordinates are not passed in query, try to get from current user profile
    if (!lat || !lng) {
      const [users] = await db.query('SELECT latitude, longitude FROM users WHERE id = ?', [userId]);
      if (users.length > 0 && users[0].latitude && users[0].longitude) {
        lat = parseFloat(users[0].latitude);
        lng = parseFloat(users[0].longitude);
      }
    }

    if (!lat || !lng) {
      return res.status(400).json({
        error: 'Location coordinates (latitude and longitude) are required. Please provide them as query parameters or complete your profile.'
      });
    }

    const query = `
      SELECT * FROM (
        SELECT 
          u.id AS blood_bank_id,
          u.full_name AS name,
          u.phone_number,
          u.location_name,
          u.latitude,
          u.longitude,
          (6371 * acos(
            cos(radians(?)) * cos(radians(u.latitude)) * 
            cos(radians(u.longitude) - radians(?)) + 
            sin(radians(?)) * sin(radians(u.latitude))
          )) AS distance_km,
          string_agg(concat(bbs.blood_group, ':', bbs.units_in_stock), ',') AS stock_info
        FROM users u
        LEFT JOIN blood_bank_stocks bbs ON u.id = bbs.user_id
        WHERE u.role = 'hospital_blood_bank' AND u.is_profile_completed = TRUE
        GROUP BY u.id
      ) AS subquery
      WHERE distance_km <= ?
      ORDER BY distance_km ASC
    `;

    const [rows] = await db.query(query, [lat, lng, lat, radius]);

    // Parse the aggregated stock info from string to array of objects
    const bloodBanks = rows.map(row => {
      const stocksList = [];
      const inStockList = [];

      if (row.stock_info) {
        row.stock_info.split(',').forEach(item => {
          const [bloodGroup, units] = item.split(':');
          const unitsInt = parseInt(units, 10);
          stocksList.push({
            blood_group: bloodGroup,
            units_in_stock: unitsInt
          });
          if (unitsInt > 0) {
            inStockList.push(bloodGroup);
          }
        });
      }

      // Format response properties matching UI expectations
      return {
        blood_bank_id: row.blood_bank_id,
        name: row.name,
        phone_number: row.phone_number,
        location_name: row.location_name,
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        distance_km: parseFloat(parseFloat(row.distance_km).toFixed(1)),
        in_stock_groups: inStockList, // e.g. ["O+", "A+", "B+"]
        stocks: stocksList
      };
    });

    return res.status(200).json({ blood_banks: bloodBanks });
  } catch (error) {
    console.error('Error fetching nearby blood banks:', error);
    return res.status(500).json({ error: 'Failed to fetch nearby blood banks.' });
  }
};

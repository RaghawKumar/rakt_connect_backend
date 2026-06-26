const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const authMiddleware = require('../middlewares/authMiddleware');

// All endpoints are protected
router.put('/', authMiddleware, stockController.updateStock);
router.get('/', authMiddleware, stockController.getMyStock);
router.get('/nearby', authMiddleware, stockController.getNearbyBloodBanks);

module.exports = router;

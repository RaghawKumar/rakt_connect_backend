const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddleware');

// Protected profile endpoints
router.put('/profile', authMiddleware, userController.updateProfile);   
router.get('/profile', authMiddleware, userController.getProfile);
router.put('/availability', authMiddleware, userController.updateAvailability);

module.exports = router;

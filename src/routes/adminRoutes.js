const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Admin Stats
router.get('/stats', adminController.getStats);

// User Management
router.get('/users', adminController.getUsers);
router.put('/users/:id', adminController.updateUser);
router.delete('/users/:id', adminController.deleteUser);

// Blood Request Management
router.get('/blood-requests', adminController.getBloodRequests);
router.put('/blood-requests/:id', adminController.updateBloodRequest);
router.delete('/blood-requests/:id', adminController.deleteBloodRequest);

// Blood Bank Stock Management
router.get('/stocks', adminController.getStocks);
router.put('/stocks/:id', adminController.updateStock);

module.exports = router;

const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const authMiddleware = require('../middlewares/authMiddleware');

// All request endpoints are protected
router.post('/', authMiddleware, requestController.createRequest);
router.get('/', authMiddleware, requestController.getRequests);
router.post('/:id/respond', authMiddleware, requestController.respondToRequest);
router.put('/:id/status', authMiddleware, requestController.updateRequestStatus);
router.get('/:id/responses', authMiddleware, requestController.getRequestResponses);
router.get('/:id/matching-donors', authMiddleware, requestController.getMatchingDonors);
router.post('/:id/complete', authMiddleware, requestController.completeDonation);

module.exports = router;

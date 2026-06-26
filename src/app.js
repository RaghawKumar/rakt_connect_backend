const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import database initialization
const initializeDatabase = require('./database/init');

// Import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const requestRoutes = require('./routes/requestRoutes');
const stockRoutes = require('./routes/stockRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root verification route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the RaktSetu (Blood Bridge) API',
    status: 'Running',
    version: '1.0.0',
    mode: process.env.NODE_ENV || 'development'
  });
});

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/blood-requests', requestRoutes);
app.use('/api/stocks', stockRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

// Initialize database tables, then start the server
const startServer = async () => {
  try {
    // Run database tables initialization
    await initializeDatabase();
    
    // Start Express listener
    app.listen(PORT, () => {
      console.log(`==================================================`);
      console.log(`RaktSetu server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Base URL: http://localhost:${PORT}`);
      console.log(`==================================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Viva.AI Backend Server - AI Orchestration
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import aiRouter from './routes/ai.js';
import { logger } from '@viva-ai/utils/logger.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/ai', aiRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'viva-ai-backend', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Viva.AI Backend listening on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

export default app;

// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http'; // [SOCKET]
import { Server } from 'socket.io'; // [SOCKET] 

import { supabase } from './supabaseClient.js';
import disastersRouter from './routes/disasters.js';
import servicesRouter from './routes/services.js';
import reportsRouter from './routes/reports.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// [SOCKET]  HTTP server from the Express app
const httpServer = http.createServer(app);

// [SOCKET] 
const io = new Server(httpServer, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});


// Middleware
app.use(cors());
app.use(express.json());

// [SOCKET] Middleware 
app.use((req, res, next) => {
  req.io = io;
  next();
});

// --- API Routes ---
app.use('/api/disasters', disastersRouter);
app.use('/api/services', servicesRouter);
app.use('/api/reports', reportsRouter);


// [SOCKET] connection listener
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});



httpServer.listen(PORT, () => {
  console.log(`Server with WebSocket support is running on http://localhost:${PORT}`);
});
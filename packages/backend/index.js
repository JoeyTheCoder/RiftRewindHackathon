const express = require('express');
const cors = require('cors');
const app = express();
const port = 3000;

// Enable CORS for frontend
app.use(cors({
  origin: 'http://localhost:4200',
  credentials: true
}));

// Simple test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'api connected' });
});

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

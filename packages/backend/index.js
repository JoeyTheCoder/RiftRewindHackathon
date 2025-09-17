const express = require('express');
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.json({ message: 'That\'s My Duo Backend is running!' });
});

app.listen(port, () => {
  console.log(`🚀 Backend server running on http://localhost:${port}`);
});

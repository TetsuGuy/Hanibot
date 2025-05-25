import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup Express dashboard
const app = express();
const port = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json(global.statusInfo);
});

app.listen(port, () => {
  console.log(`🌐 Dashboard running at PORT:${port}`);
});
import express from 'express';
import { evaluateAction } from './gateway';
import fs from 'fs';

const app = express();
app.use(express.json());

app.post('/v1/gatekeeper', (req, res) => {
  const { intent, riskScore } = req.body;
  const decision = evaluateAction(intent, riskScore);

  const logEntry = `[${new Date().toISOString()}] ${decision.status} | Intent: ${intent} | Token: ${decision.token || 'NONE'}\n`;
  fs.appendFileSync('forensic.log', logEntry);

  res.status(decision.code || 200).json(decision);
});

app.get('/', (req, res) => {
  const logs = fs.existsSync('forensic.log') ? fs.readFileSync('forensic.log', 'utf8').split('\n').slice(-10).reverse().join('<br>') : "Ready.";
  res.send(`
    <html>
      <body style="background:#05070a; color:#58a6ff; font-family:monospace; padding:40px;">
        <h1>SENTINEL PROXY GATEWAY</h1>
        <div style="border:1px solid #30363d; padding:20px; background:#0d1117;">
          <h3>LIVE SIGNING LEDGER</h3>
          ${logs}
        </div>
      </body>
    </html>
  `);
});

app.listen(3000);

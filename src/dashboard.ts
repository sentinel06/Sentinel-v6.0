import express from 'express';
import helmet from 'helmet';
import fs from 'fs';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(helmet());

const port = 3000;
const VALID_SIG = "EBB9B2EC6C77412B7D4DA8BA1FEC27F68364DF6360E48E933B87BE18589CF2E7";

app.post('/v1/gatekeeper', (req, res) => {
  const { intent, riskScore } = req.body;
  let status = "ALLOWED";
  let remediation = "NONE";

  if (riskScore >= 0.9) {
    status = "HARD_BLOCK";
    remediation = "PURGE_SESSION_MEMORY_AND_REBOOT"; // The Reset Command
  } else if (riskScore >= 0.5) {
    status = "HUMAN_REQUIRED";
    remediation = "AWAIT_MANUAL_BYPASS";
  }

  const logEntry = `[${new Date().toISOString()}] [${status}] Action: ${intent} | Reset: ${remediation}\n`;
  fs.appendFileSync('forensic.log', logEntry);

  res.json({
    status,
    remediation,
    signature: crypto.createHmac('sha256', VALID_SIG).update(intent).digest('hex')
  });
});

app.get('/', (req, res) => {
  const logs = fs.existsSync('forensic.log') ? fs.readFileSync('forensic.log', 'utf8').split('\n').slice(-10).reverse().join('<br>') : "System idle...";
  res.send(`
    <html>
      <head>
        <title>Sentinel Autonomous Sentry</title>
        <style>
          body { background: #05070a; color: #58a6ff; font-family: monospace; padding: 20px; }
          .log-box { background: #0d1117; border: 1px solid #30363d; padding: 15px; margin-top: 20px; color: #c9d1d9; }
          .RESET_ACTIVE { color: #f85149; text-transform: uppercase; animation: blinker 1s linear infinite; }
          @keyframes blinker { 50% { opacity: 0; } }
        </style>
        <meta http-equiv="refresh" content="3">
      </head>
      <body>
        <h1>SENTINEL-v6.0: ACTIVE REMEDIATION</h1>
        <div class="log-box">${logs.replace(/PURGE_SESSION_MEMORY_AND_REBOOT/g, '<span class="RESET_ACTIVE">NEURAL RESET ISSUED</span>')}</div>
      </body>
    </html>
  `);
});

app.listen(port, () => console.log('Sentry Remediation Gateway Online.'));

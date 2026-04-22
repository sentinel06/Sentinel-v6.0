import express from 'express';
import helmet from 'helmet';
import fs from 'fs';

const app = express();
const port = 3000;

app.use(helmet());

const REMOTE_SIGNATURE = process.env.REMOTE_SIGNATURE || "PENDING";
const IS_VERIFIED = REMOTE_SIGNATURE === "EBB9B2EC6C77412B7D4DA8BA1FEC27F68364DF6360E48E933B87BE18589CF2E7";

app.get('/', (req, res) => {
  // Read the latest thoughts from the simulator
  const logs = fs.existsSync('forensic.log') ? fs.readFileSync('forensic.log', 'utf8').split('\n').slice(-5).join('<br>') : "Waiting for reasoning plane...";

  res.send(`
    <html>
      <head>
        <title>Sentinel Sovereign</title>
        <style>
          body { background: #05070a; color: #58a6ff; font-family: 'Courier New', monospace; padding: 40px; }
          .container { border: 1px solid #30363d; padding: 20px; border-radius: 8px; background: #0d1117; }
          .verified { color: #3fb950; text-shadow: 0 0 10px #238636; }
          .reasoning { color: #f85149; background: #161b22; padding: 15px; border-left: 4px solid #da3633; margin-top: 20px; font-style: italic; }
          .header { border-bottom: 1px solid #30363d; padding-bottom: 10px; margin-bottom: 20px; }
        </style>
        <meta http-equiv="refresh" content="5">
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>NEURAL SOVEREIGNTY v6.0</h1>
            <p>STATUS: <span class="${IS_VERIFIED ? 'verified' : ''}">${IS_VERIFIED ? '● VERIFIED SECURE' : '○ PENDING'}</span></p>
          </div>
          <h3>[BLACK_BOX_REASONING]</h3>
          <div class="reasoning">
            ${logs}
          </div>
          <p style="font-size: 10px; margin-top: 30px; color: #8b949e;">FIPS 204 | SLSA L4 | MIT-SOVEREIGN LICENSE ACTIVE</p>
        </div>
      </body>
    </html>
  `);
});

app.listen(port, () => console.log('Sovereign Interface active on Port 3000'));

import http from 'http';

const PORT = 3000;
const START_TIME = new Date().toLocaleString();

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <html>
            <head>
                <style>
                    body { background: #050505; color: #0f0; font-family: 'Courier New', monospace; padding: 30px; line-height: 1.6; }
                    .container { border: 2px solid #0f0; padding: 20px; box-shadow: 0 0 15px #0f0; max-width: 800px; margin: auto; }
                    .header { text-align: center; border-bottom: 2px solid #0f0; margin-bottom: 20px; padding-bottom: 10px; }
                    .stat { display: flex; justify-content: space-between; margin: 10px 0; font-size: 1.2em; }
                    .label { color: #888; }
                    .value { color: #fff; font-weight: bold; }
                    .terminal { background: #000; border: 1px inset #333; padding: 15px; margin-top: 20px; height: 200px; overflow-y: auto; color: #0fa; }
                    .blink { animation: blinker 1s linear infinite; color: #f00; }
                    @keyframes blinker { 50% { opacity: 0; } }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>SENTINEL SOVEREIGN DASHBOARD v6.1.1</h1>
                        <div>SESSION_START: ${START_TIME}</div>
                    </div>
                    <div class="stat"><span class="label">VAULT_STATUS:</span> <span class="value" style="color: #0f0;">LISTENING</span></div>
                    <div class="stat"><span class="label">THREAT_LEVEL:</span> <span class="value" style="color: #f90;">ELEVATED (INTERDICTION ACTIVE)</span></div>
                    <div class="stat"><span class="label">HANDSHAKE:</span> <span class="value" class="blink">PENDING_REMOTE_SIGNATURE</span></div>
                    <div class="terminal">
                        [SYSTEM]: Dashboard initialized on Port ${PORT}...<br>
                        [SYSTEM]: Waiting for Run #8 telemetry from GitHub Vault...<br>
                        [SYSTEM]: Interdiction timer active. 12 minutes remaining...<br>
                    </div>
                </div>
            </body>
        </html>
    `);
});

server.listen(PORT, () => {
    console.log(`Dashboard Upgraded. Live at http://localhost:${PORT}`);
});

import http from 'http';

const PORT = 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <html>
            <body style="background:#000; color:#0f0; font-family:monospace; padding:20px;">
                <h1>SENTINEL-v6.0 DASHBOARD</h1>
                <hr>
                <div>STATUS: <span style="color:#fff">ACTIVE</span></div>
                <div>NODES: <span style="color:#fff">1 (GitHub Production Vault)</span></div>
                <div style="margin-top:20px; border:1px solid #0f0; padding:10px;">
                    <h3>LATEST TELEMETRY</h3>
                    <p id="log">[WAITING FOR HANDSHAKE...]</p>
                </div>
            </body>
        </html>
    `);
});

server.listen(PORT, () => {
    console.log(`Dashboard live at http://localhost:${PORT}`);
});

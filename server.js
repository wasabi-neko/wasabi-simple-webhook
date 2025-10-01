const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

let requests = [];

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.text({ type: '*/*', limit: '10mb' }));

function logRequest(req, res, next) {
  if (req.url === '/' || req.url === '/clear') {
    return next();
  }
  
  const timestamp = new Date().toISOString();
  const requestData = {
    id: Date.now(),
    timestamp,
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body,
    query: req.query,
    ip: req.ip || req.connection.remoteAddress
  };
  
  requests.unshift(requestData);
  if (requests.length > 100) {
    requests = requests.slice(0, 100);
  }
  
  console.log(`[${timestamp}] ${req.method} ${req.url} from ${requestData.ip}`);
  
  next();
}

app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Webhook Test Server</title>
  <style>
    body { font-family: monospace; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { background: #333; color: white; padding: 20px; margin-bottom: 20px; }
    .request { background: white; margin: 10px 0; padding: 15px; border-left: 4px solid #007acc; }
    .method { font-weight: bold; color: #007acc; }
    .timestamp { color: #666; font-size: 12px; }
    .headers, .body { margin: 10px 0; }
    .json { background: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; }
    .clear-btn { background: #dc3545; color: white; border: none; padding: 10px 20px; cursor: pointer; }
  </style>
  <script>
    function clearRequests() {
      fetch('/clear', { method: 'POST' })
        .then(() => location.reload());
    }
    function refreshPage() {
      location.reload();
    }
  </script>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔗 Webhook Test Server</h1>
      <p>Send requests to <strong>/webhook</strong> to see them here.</p>
      <button class="clear-btn" onclick="clearRequests()">Clear All Requests</button>
      <button class="clear-btn" onclick="refreshPage()" style="background: #28a745; margin-left: 10px;">Refresh</button>
    </div>
    
    <div>
      <h2>Recent Requests (${requests.length})</h2>
      ${requests.map(req => `
        <div class="request">
          <div>
            <span class="method">${req.method}</span> 
            <strong>${req.url}</strong>
            <span class="timestamp">${req.timestamp}</span>
          </div>
          
          <div class="headers">
            <strong>Headers:</strong>
            <div class="json">${JSON.stringify(req.headers, null, 2)}</div>
          </div>
          
          ${req.query && Object.keys(req.query).length ? `
            <div>
              <strong>Query:</strong>
              <div class="json">${JSON.stringify(req.query, null, 2)}</div>
            </div>
          ` : ''}
          
          ${req.body ? `
            <div class="body">
              <strong>Body:</strong>
              <div class="json">${typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2)}</div>
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;
  
  res.send(html);
});

app.post('/clear', (req, res) => {
  requests = [];
  res.json({ message: 'Requests cleared' });
});

app.all('/webhook', logRequest, (req, res) => {
  res.json({
    message: 'Webhook received successfully',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url
  });
});

app.all('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: 'Send webhooks to /webhook endpoint',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🔗 Webhook server running on http://localhost:${PORT}`);
  console.log('Send requests to any endpoint to test webhooks');
});
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

let requests = [];

// keep the body exactly as received, for the Raw view
const captureRawBody = (req, res, buf, encoding) => {
  req.rawBody = buf.toString(encoding || 'utf8');
};

app.use(express.json({ limit: '10mb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, limit: '10mb', verify: captureRawBody }));
app.use(express.text({ type: '*/*', limit: '10mb', verify: captureRawBody }));

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
    rawBody: req.rawBody ?? (typeof req.body === 'string' ? req.body : ''),
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
  // "<" is escaped so a request body can never close the script tag
  const requestsJson = JSON.stringify(requests).replace(/</g, '\\u003c');

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
    .section { margin: 10px 0; }
    .section-title { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
    .json, .raw { background: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 0; }
    .raw { white-space: pre-wrap; overflow-wrap: anywhere; }
    .clear-btn { background: #dc3545; color: white; border: none; padding: 10px 20px; cursor: pointer; }

    .seg { display: inline-flex; border: 1px solid #007acc; border-radius: 4px; overflow: hidden; }
    .seg button { font: inherit; font-size: 12px; border: none; background: white; color: #007acc; padding: 2px 10px; cursor: pointer; }
    .seg button.active { background: #007acc; color: white; }
    .seg button:disabled { color: #aaa; cursor: not-allowed; }
    .link-btn { font: inherit; font-size: 12px; border: none; background: none; color: #007acc; cursor: pointer; padding: 0; text-decoration: underline; }

    .tree { line-height: 1.5; overflow-wrap: anywhere; }
    .tree .children { padding-left: 1.5em; border-left: 1px dotted #ddd; margin-left: 0.3em; }
    .tree .toggle { cursor: pointer; user-select: none; display: inline-block; width: 1em; color: #888; transition: transform 0.1s; }
    .tree .node.collapsed > .toggle { transform: rotate(-90deg); }
    .tree .node > .summary { display: none; color: #888; cursor: pointer; }
    .tree .node.collapsed > .summary { display: inline; }
    .tree .node.collapsed > .children { display: none; }
    .tree .key { color: #881391; }
    .tree .str { color: #1a7f37; }
    .tree .num { color: #1750eb; }
    .tree .bool, .tree .null { color: #c2185b; }
    .tree .punct { color: #555; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔗 Webhook Test Server</h1>
      <p>Send requests to <strong>/webhook</strong> to see them here.</p>
      <button class="clear-btn" onclick="clearRequests()">Clear All Requests</button>
      <button class="clear-btn" onclick="location.reload()" style="background: #28a745; margin-left: 10px;">Refresh</button>
    </div>

    <div>
      <h2>Recent Requests (${requests.length})</h2>
      <div id="requests"></div>
    </div>
  </div>

  <script id="requests-data" type="application/json">${requestsJson}</script>
  <script>
    const VIEW_KEY = 'webhook-body-view';

    function clearRequests() {
      fetch('/clear', { method: 'POST' }).then(() => location.reload());
    }

    function savedView() {
      try { return localStorage.getItem(VIEW_KEY) || 'json'; } catch (e) { return 'json'; }
    }

    function saveView(view) {
      try { localStorage.setItem(VIEW_KEY, view); } catch (e) {}
    }

    function el(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function parsedBody(req) {
      if (req.rawBody) {
        try { return { ok: true, value: JSON.parse(req.rawBody) }; } catch (e) {}
      }
      if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
        return { ok: true, value: req.body };
      }
      return { ok: false };
    }

    function renderValue(value) {
      if (value === null) return el('span', 'null', 'null');
      if (typeof value === 'string') return el('span', 'str', JSON.stringify(value));
      if (typeof value === 'number') return el('span', 'num', String(value));
      if (typeof value === 'boolean') return el('span', 'bool', String(value));

      const isArray = Array.isArray(value);
      const entries = isArray ? value.map((v, i) => [i, v]) : Object.entries(value);
      const open = isArray ? '[' : '{';
      const close = isArray ? ']' : '}';
      if (!entries.length) return el('span', 'punct', open + close);

      const node = el('span', 'node');
      const toggle = el('span', 'toggle', '▾');
      const noun = isArray ? (entries.length === 1 ? 'item' : 'items') : (entries.length === 1 ? 'key' : 'keys');
      const summary = el('span', 'summary', ' ' + entries.length + ' ' + noun + ' ');
      const children = el('div', 'children');

      entries.forEach(([key, child], index) => {
        const line = el('div', 'line');
        if (!isArray) {
          line.append(el('span', 'key', JSON.stringify(key)), el('span', 'punct', ': '));
        }
        line.append(renderValue(child));
        if (index < entries.length - 1) line.append(el('span', 'punct', ','));
        children.append(line);
      });

      const flip = () => node.classList.toggle('collapsed');
      toggle.onclick = flip;
      summary.onclick = flip;
      node.append(toggle, el('span', 'punct', open), summary, children, el('span', 'punct', close));
      return node;
    }

    function renderBody(req) {
      const section = el('div', 'section');
      const title = el('div', 'section-title');
      title.append(el('strong', null, 'Body:'));

      const parsed = parsedBody(req);
      const seg = el('span', 'seg');
      const jsonBtn = el('button', null, 'JSON');
      const rawBtn = el('button', null, 'Raw');
      seg.append(jsonBtn, rawBtn);
      title.append(seg);

      const expandAll = el('button', 'link-btn', 'expand all');
      const collapseAll = el('button', 'link-btn', 'collapse all');
      title.append(expandAll, collapseAll);

      const tree = el('div', 'json tree');
      if (parsed.ok) tree.append(renderValue(parsed.value));
      const raw = el('pre', 'raw', req.rawBody || '(empty body)');

      section.append(title, tree, raw);

      function show(view) {
        const useJson = view === 'json' && parsed.ok;
        tree.style.display = useJson ? '' : 'none';
        raw.style.display = useJson ? 'none' : '';
        expandAll.style.display = useJson ? '' : 'none';
        collapseAll.style.display = useJson ? '' : 'none';
        jsonBtn.classList.toggle('active', useJson);
        rawBtn.classList.toggle('active', !useJson);
      }

      jsonBtn.disabled = !parsed.ok;
      if (!parsed.ok) jsonBtn.title = 'Body is not JSON';
      jsonBtn.onclick = () => { saveView('json'); show('json'); };
      rawBtn.onclick = () => { saveView('raw'); show('raw'); };
      expandAll.onclick = () => tree.querySelectorAll('.node').forEach(n => n.classList.remove('collapsed'));
      collapseAll.onclick = () => {
        tree.querySelectorAll('.node').forEach(n => n.classList.add('collapsed'));
        const root = tree.querySelector('.node');
        if (root) root.classList.remove('collapsed');
      };

      show(savedView());
      return section;
    }

    function renderPlainSection(label, value) {
      const section = el('div', 'section');
      section.append(el('strong', null, label), el('pre', 'json', JSON.stringify(value, null, 2)));
      return section;
    }

    function renderRequest(req) {
      const card = el('div', 'request');
      const head = el('div');
      head.append(el('span', 'method', req.method), document.createTextNode(' '), el('strong', null, req.url),
        document.createTextNode(' '), el('span', 'timestamp', req.timestamp));
      card.append(head, renderPlainSection('Headers:', req.headers));
      if (req.query && Object.keys(req.query).length) card.append(renderPlainSection('Query:', req.query));
      if (req.rawBody || (req.body && Object.keys(req.body).length)) card.append(renderBody(req));
      return card;
    }

    const requests = JSON.parse(document.getElementById('requests-data').textContent);
    const list = document.getElementById('requests');
    requests.forEach(req => list.append(renderRequest(req)));
  </script>
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

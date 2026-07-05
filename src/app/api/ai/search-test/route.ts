import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/ai/search-test
 * Returns a simple HTML page for testing web search in the browser.
 */
export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mr Robot - Search Test</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: #0a0a0f; color: #e4e4e7; padding: 20px; max-width: 900px; margin: 0 auto; }
h1 { background: linear-gradient(90deg, #f59e0b, #ef4444, #ec4899); -webkit-background-clip: text; background-clip: text; color: transparent; margin-bottom: 8px; }
.subtitle { color: #71717a; margin-bottom: 24px; font-size: 14px; }
.box { background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
input[type="text"] { width: 100%; padding: 12px 16px; background: #09090b; border: 1px solid #27272a; border-radius: 8px; color: #e4e4e7; font-size: 14px; outline: none; margin-bottom: 12px; }
input[type="text"]:focus { border-color: #f59e0b; }
button { padding: 10px 20px; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; margin-right: 8px; }
.btn-search { background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; }
.btn-clear { background: #27272a; color: #f59e0b; border: 1px solid #f59e0b; }
.btn-diag { background: #27272a; color: #38bdf8; border: 1px solid #38bdf8; }
button:hover { opacity: 0.9; }
#results { margin-top: 16px; }
.result { background: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; }
.result h3 { color: #f59e0b; font-size: 14px; margin-bottom: 4px; }
.result a { color: #38bdf8; font-size: 12px; text-decoration: none; word-break: break-all; }
.result p { color: #a1a1aa; font-size: 13px; margin-top: 4px; line-height: 1.5; }
.result .source { color: #71717a; font-size: 10px; text-transform: uppercase; margin-top: 4px; }
.status { padding: 8px 12px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.status.ok { background: rgba(16, 185, 129, 0.1); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
.status.err { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
.status.info { background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); }
.count { font-size: 13px; color: #71717a; margin-bottom: 12px; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #f59e0b; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.examples { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.example { padding: 4px 12px; background: #27272a; border-radius: 16px; font-size: 12px; color: #a1a1aa; cursor: pointer; border: 1px solid #3f3f46; }
.example:hover { border-color: #f59e0b; color: #f59e0b; }
.diag-result { font-family: monospace; font-size: 12px; white-space: pre-wrap; color: #a1a1aa; }
</style>
</head>
<body>
<h1>Mr Robot - Search Test</h1>
<p class="subtitle">Test web search directly. This bypasses the chat and shows you exactly what the search engine finds.</p>

<div class="box">
  <input type="text" id="query" placeholder="Type a search query... (e.g. javascript, python, paris, world cup 2026)" onkeydown="if(event.key==='Enter')doSearch()">
  <div>
    <button class="btn-search" onclick="doSearch()">Search</button>
    <button class="btn-clear" onclick="clearCache()">Clear Cache</button>
    <button class="btn-diag" onclick="runDiag()">Run Diagnostics</button>
  </div>
  <div class="examples">
    <span class="example" onclick="document.getElementById('query').value='javascript';doSearch()">javascript</span>
    <span class="example" onclick="document.getElementById('query').value='python programming';doSearch()">python programming</span>
    <span class="example" onclick="document.getElementById('query').value='paris france';doSearch()">paris france</span>
    <span class="example" onclick="document.getElementById('query').value='world cup 2026';doSearch()">world cup 2026</span>
    <span class="example" onclick="document.getElementById('query').value='react framework';doSearch()">react framework</span>
    <span class="example" onclick="document.getElementById('query').value='artificial intelligence';doSearch()">artificial intelligence</span>
  </div>
</div>

<div id="status"></div>
<div id="results"></div>

<script>
async function doSearch() {
  const q = document.getElementById('query').value.trim();
  if (!q) return;
  
  document.getElementById('status').innerHTML = '<div class="status info"><span class="spinner"></span> Searching for: ' + escapeHtml(q) + '...</div>';
  document.getElementById('results').innerHTML = '';
  
  try {
    const res = await fetch('/api/ai/search?query=' + encodeURIComponent(q));
    const data = await res.json();
    
    if (data.error) {
      document.getElementById('status').innerHTML = '<div class="status err">Error: ' + escapeHtml(data.error) + '</div>';
      return;
    }
    
    const count = data.count !== undefined ? data.count : (data.results || []).length;
    document.getElementById('status').innerHTML = '<div class="status ok">Found ' + count + ' result(s) for "' + escapeHtml(q) + '"</div>';
    
    if (count === 0) {
      document.getElementById('results').innerHTML = '<div class="result"><p>No results found. Try a different query or clear the cache.</p></div>';
      return;
    }
    
    let html = '<div class="count">' + count + ' results from Wikipedia + DuckDuckGo</div>';
    for (const r of (data.results || [])) {
      html += '<div class="result">';
      html += '<h3>' + escapeHtml(r.title) + '</h3>';
      html += '<a href="' + escapeHtml(r.url) + '" target="_blank">' + escapeHtml(r.url) + '</a>';
      if (r.snippet) html += '<p>' + escapeHtml(r.snippet.substring(0, 300)) + (r.snippet.length > 300 ? '...' : '') + '</p>';
      html += '<div class="source">Source: ' + escapeHtml(r.source) + '</div>';
      html += '</div>';
    }
    document.getElementById('results').innerHTML = html;
  } catch (e) {
    document.getElementById('status').innerHTML = '<div class="status err">Request failed: ' + escapeHtml(e.message) + '</div>';
  }
}

async function clearCache() {
  document.getElementById('status').innerHTML = '<div class="status info"><span class="spinner"></span> Clearing cache...</div>';
  try {
    const res = await fetch('/api/ai/search?clearCache=1');
    const data = await res.json();
    document.getElementById('status').innerHTML = '<div class="status ok">' + escapeHtml(data.message || 'Cache cleared') + '</div>';
  } catch (e) {
    document.getElementById('status').innerHTML = '<div class="status err">Failed: ' + escapeHtml(e.message) + '</div>';
  }
}

async function runDiag() {
  document.getElementById('status').innerHTML = '<div class="status info"><span class="spinner"></span> Running diagnostics...</div>';
  document.getElementById('results').innerHTML = '';
  try {
    const res = await fetch('/api/ai/diagnose');
    const data = await res.json();
    let html = '<div class="count">Network Diagnostics Results:</div>';
    for (const r of (data.results || [])) {
      const icon = r.status === 'ok' ? '[OK]' : r.status === 'slow' ? '[SLOW]' : '[FAIL]';
      const color = r.status === 'ok' ? '#10b981' : r.status === 'slow' ? '#f59e0b' : '#ef4444';
      html += '<div class="result"><div style="color:' + color + ';font-family:monospace;font-size:12px;">' + icon + ' ' + escapeHtml(r.test) + '</div><div style="color:#71717a;font-size:12px;margin-top:4px;">' + escapeHtml(r.detail) + '</div></div>';
    }
    if (data.diagnosis) {
      html += '<div class="result" style="border-color:#38bdf8;"><div style="color:#38bdf8;font-size:13px;font-weight:600;">Diagnosis:</div><div style="color:#a1a1aa;font-size:13px;margin-top:4px;">' + escapeHtml(data.diagnosis) + '</div></div>';
    }
    document.getElementById('status').innerHTML = '<div class="status ok">Diagnostics complete: ' + data.summary.ok + ' OK, ' + data.summary.fail + ' failed, ' + data.summary.slow + ' slow</div>';
    document.getElementById('results').innerHTML = html;
  } catch (e) {
    document.getElementById('status').innerHTML = '<div class="status err">Failed: ' + escapeHtml(e.message) + '</div>';
  }
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
</script>
</body>
</html>`;
  
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

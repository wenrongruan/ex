function formatTime(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

async function renderLogs() {
  const container = document.getElementById('log-container')
  if (!container) return

  const stored = await chrome.storage.local.get(['_logs'])
  const logs = Array.isArray(stored._logs) ? stored._logs : []

  if (logs.length === 0) {
    container.innerHTML = '<div class="empty">No log entries yet. Logs appear when the extension connects, attaches tabs, or encounters errors.</div>'
    return
  }

  // Show newest first
  const reversed = [...logs].reverse()

  let html = '<table class="log-table"><thead><tr><th>Time</th><th>Level</th><th>Message</th></tr></thead><tbody>'
  for (const entry of reversed) {
    html += `<tr data-level="${escapeHtml(entry.level)}"><td class="ts">${formatTime(entry.ts)}</td><td class="level">${escapeHtml(entry.level)}</td><td>${escapeHtml(entry.msg)}</td></tr>`
  }
  html += '</tbody></table>'
  container.innerHTML = html
}

document.getElementById('refresh').addEventListener('click', () => void renderLogs())
void renderLogs()

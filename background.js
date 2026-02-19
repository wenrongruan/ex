const DEFAULT_PORT = 18792

const BADGE = {
  on: { text: 'ON', color: '#FF5A36' },
  off: { text: '', color: '#000000' },
  connecting: { text: '…', color: '#F59E0B' },
  error: { text: '!', color: '#B91C1C' },
}

// ── Stage 1: Stealth script (Anti-detection Plan A) ──

const STEALTH_SCRIPT = `
(function() {
  // Override navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true,
  });

  // Override navigator.plugins with realistic plugin objects
  const makePlugin = (name, description, filename, mimeType) => {
    const plugin = Object.create(Plugin.prototype);
    Object.defineProperties(plugin, {
      name: { get: () => name, enumerable: true },
      description: { get: () => description, enumerable: true },
      filename: { get: () => filename, enumerable: true },
      length: { get: () => 1, enumerable: true },
      0: { get: () => mimetype, enumerable: true },
    });
    const mimetype = Object.create(MimeType.prototype);
    Object.defineProperties(mimetype, {
      type: { get: () => mimeType, enumerable: true },
      suffixes: { get: () => '', enumerable: true },
      description: { get: () => description, enumerable: true },
      enabledPlugin: { get: () => plugin, enumerable: true },
    });
    plugin.item = (i) => i === 0 ? mimetype : null;
    plugin.namedItem = (n) => n === mimeType ? mimetype : null;
    return plugin;
  };

  const plugins = [
    makePlugin('Chrome PDF Plugin', 'Portable Document Format', 'internal-pdf-viewer', 'application/x-google-chrome-pdf'),
    makePlugin('Chrome PDF Viewer', '', 'mhjfbmdgcfjbbpaeojofohoefgiehjai', 'application/pdf'),
    makePlugin('Native Client', '', 'internal-nacl-plugin', 'application/x-nacl'),
  ];

  const pluginArray = Object.create(PluginArray.prototype);
  Object.defineProperty(pluginArray, 'length', { get: () => plugins.length, enumerable: true });
  plugins.forEach((p, i) => {
    Object.defineProperty(pluginArray, i, { get: () => p, enumerable: true });
  });
  pluginArray.item = (i) => plugins[i] || null;
  pluginArray.namedItem = (name) => plugins.find(p => p.name === name) || null;
  pluginArray.refresh = () => {};
  pluginArray[Symbol.iterator] = function* () { yield* plugins; };

  Object.defineProperty(navigator, 'plugins', {
    get: () => pluginArray,
    configurable: true,
  });
})();
`

// ── Stage 2: Interaction command random delay (Plan B) ──

const INTERACTION_METHODS = new Set([
  'Input.dispatchMouseEvent',
  'Input.dispatchKeyEvent',
  'Input.dispatchTouchEvent',
  'Input.insertText',
])

// ── State variables ──

/** @type {WebSocket|null} */
let relayWs = null
/** @type {Promise<void>|null} */
let relayConnectPromise = null

let debuggerListenersInstalled = false

let nextSession = 1

/** @type {Map<number, {state:'connecting'|'connected', sessionId?:string, targetId?:string, attachOrder?:number}>} */
const tabs = new Map()
/** @type {Map<string, number>} */
const tabBySession = new Map()
/** @type {Map<string, number>} */
const childSessionToTab = new Map()

/** @type {Map<number, {resolve:(v:any)=>void, reject:(e:Error)=>void}>} */
const pending = new Map()

// ── Stage 5: Connection stability state ──

/** @type {number|null} */
let reconnectTimer = null
let reconnectDelay = 1000
const MAX_RECONNECT_DELAY = 30000
let autoReconnectEnabled = false
/** @type {Set<number>} */
let previouslyAttachedTabs = new Set()

// Heartbeat state
/** @type {number|null} */
let heartbeatInterval = null
let lastPongTime = 0
const HEARTBEAT_INTERVAL = 15000
const HEARTBEAT_TIMEOUT = 10000

// ── Stage 8: Log buffer ──

/** @type {Array<{ts:number, level:string, msg:string}>} */
const logBuffer = []
const LOG_BUFFER_MAX = 200

function appendLog(level, msg) {
  const entry = { ts: Date.now(), level, msg: String(msg) }
  logBuffer.push(entry)
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift()
  // Persist to storage (fire-and-forget)
  chrome.storage.local.set({ _logs: logBuffer }).catch(() => { })
}

// ── Utilities ──

function nowStack() {
  try {
    return new Error().stack || ''
  } catch {
    return ''
  }
}

async function getRelayPort() {
  const stored = await chrome.storage.local.get(['relayPort'])
  const raw = stored.relayPort
  const n = Number.parseInt(String(raw || ''), 10)
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return DEFAULT_PORT
  return n
}

// ── Stage 6: Auth token ──

async function getAuthToken() {
  const stored = await chrome.storage.local.get(['authToken'])
  return typeof stored.authToken === 'string' ? stored.authToken.trim() : ''
}

function setBadge(tabId, kind) {
  const cfg = BADGE[kind]
  void chrome.action.setBadgeText({ tabId, text: cfg.text })
  void chrome.action.setBadgeBackgroundColor({ tabId, color: cfg.color })
  void chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }).catch(() => { })
}

// ── Stage 5: Heartbeat ──

function startHeartbeat() {
  stopHeartbeat()
  lastPongTime = Date.now()
  heartbeatInterval = setInterval(() => {
    if (!relayWs || relayWs.readyState !== WebSocket.OPEN) {
      stopHeartbeat()
      return
    }
    // Check pong timeout
    if (Date.now() - lastPongTime > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT) {
      appendLog('warn', 'Heartbeat timeout, forcing WebSocket close')
      stopHeartbeat()
      relayWs.close()
      return
    }
    try {
      sendToRelay({ method: 'ping' })
    } catch {
      // ignore
    }
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (heartbeatInterval !== null) {
    clearInterval(heartbeatInterval)
    heartbeatInterval = null
  }
}

// ── Connection management ──

async function ensureRelayConnection() {
  if (relayWs && relayWs.readyState === WebSocket.OPEN) return
  if (relayConnectPromise) return await relayConnectPromise

  relayConnectPromise = (async () => {
    const port = await getRelayPort()
    const httpBase = `http://127.0.0.1:${port}`

    // Stage 6: Build WebSocket URL with optional auth token
    const token = await getAuthToken()
    let wsUrl = `ws://127.0.0.1:${port}/extension`
    if (token) {
      wsUrl += `?token=${encodeURIComponent(token)}`
    }

    // Fast preflight: is the relay server up?
    try {
      await fetch(`${httpBase}/`, { method: 'HEAD', signal: AbortSignal.timeout(2000) })
    } catch (err) {
      throw new Error(`Relay server not reachable at ${httpBase} (${String(err)})`)
    }

    const ws = new WebSocket(wsUrl)
    relayWs = ws

    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WebSocket connect timeout')), 5000)
      ws.onopen = () => {
        clearTimeout(t)
        resolve()
      }
      ws.onerror = () => {
        clearTimeout(t)
        reject(new Error('WebSocket connect failed'))
      }
      ws.onclose = (ev) => {
        clearTimeout(t)
        reject(new Error(`WebSocket closed (${ev.code} ${ev.reason || 'no reason'})`))
      }
    })

    ws.onmessage = (event) => void onRelayMessage(String(event.data || ''))
    ws.onclose = () => onRelayClosed('closed')
    ws.onerror = () => onRelayClosed('error')

    if (!debuggerListenersInstalled) {
      debuggerListenersInstalled = true
      chrome.debugger.onEvent.addListener(onDebuggerEvent)
      chrome.debugger.onDetach.addListener(onDebuggerDetach)
    }

    // Stage 5: Enable auto-reconnect and heartbeat on successful connection
    autoReconnectEnabled = true
    reconnectDelay = 1000
    startHeartbeat()
    appendLog('info', `Connected to relay at ${wsUrl}`)
  })()

  try {
    await relayConnectPromise
  } finally {
    relayConnectPromise = null
  }
}

function onRelayClosed(reason) {
  appendLog('warn', `Relay disconnected: ${reason}`)
  stopHeartbeat()

  // Stage 5: Save previously attached tabs before clearing
  previouslyAttachedTabs = new Set(tabs.keys())

  relayWs = null
  for (const [id, p] of pending.entries()) {
    pending.delete(id)
    p.reject(new Error(`Relay disconnected (${reason})`))
  }

  for (const tabId of tabs.keys()) {
    void chrome.debugger.detach({ tabId }).catch(() => { })
    setBadge(tabId, 'connecting')
    void chrome.action.setTitle({
      tabId,
      title: 'CDPilot: disconnected (click to re-attach)',
    })
  }
  tabs.clear()
  tabBySession.clear()
  childSessionToTab.clear()

  // Stage 5: Schedule reconnect
  if (autoReconnectEnabled) {
    scheduleReconnect()
  }
}

// ── Stage 5: Reconnection logic ──

function scheduleReconnect() {
  if (reconnectTimer !== null) return
  appendLog('info', `Scheduling reconnect in ${reconnectDelay}ms`)
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null
    try {
      await ensureRelayConnection()
      appendLog('info', 'Reconnected successfully')
      reconnectDelay = 1000
      await reattachTabs()
    } catch (err) {
      appendLog('warn', `Reconnect failed: ${err instanceof Error ? err.message : String(err)}`)
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
      if (autoReconnectEnabled) {
        scheduleReconnect()
      }
    }
  }, reconnectDelay)
}

async function reattachTabs() {
  for (const tabId of previouslyAttachedTabs) {
    try {
      const tab = await chrome.tabs.get(tabId).catch(() => null)
      if (!tab) continue
      await attachTab(tabId)
      appendLog('info', `Re-attached tab ${tabId}`)
    } catch (err) {
      appendLog('warn', `Failed to re-attach tab ${tabId}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  previouslyAttachedTabs.clear()
}

// ── Message handling ──

function sendToRelay(payload) {
  const ws = relayWs
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('Relay not connected')
  }
  ws.send(JSON.stringify(payload))
}

async function maybeOpenHelpOnce() {
  try {
    const stored = await chrome.storage.local.get(['helpOnErrorShown'])
    if (stored.helpOnErrorShown === true) return
    await chrome.storage.local.set({ helpOnErrorShown: true })
    await chrome.runtime.openOptionsPage()
  } catch {
    // ignore
  }
}

function requestFromRelay(command) {
  const id = command.id
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    try {
      sendToRelay(command)
    } catch (err) {
      pending.delete(id)
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

async function onRelayMessage(text) {
  /** @type {any} */
  let msg
  try {
    msg = JSON.parse(text)
  } catch {
    return
  }

  if (msg && msg.method === 'ping') {
    try {
      sendToRelay({ method: 'pong' })
    } catch {
      // ignore
    }
    return
  }

  // Stage 5: Handle pong for heartbeat
  if (msg && msg.method === 'pong') {
    lastPongTime = Date.now()
    return
  }

  if (msg && typeof msg.id === 'number' && (msg.result !== undefined || msg.error !== undefined)) {
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(String(msg.error)))
    else p.resolve(msg.result)
    return
  }

  // Stage 11: 新 Python 客户端接入 — 重新广播所有已附加标签页会话
  // 解决 Python 连接前已附加标签页、错过 Target.attachedToTarget 事件的问题
  if (msg && msg.method === 'clientConnected') {
    for (const [tabId, tab] of tabs.entries()) {
      if (tab.state !== 'connected') continue
      const info = await chrome.tabs.get(tabId).catch(() => null)
      try {
        sendToRelay({
          method: 'forwardCDPEvent',
          params: {
            method: 'Target.attachedToTarget',
            params: {
              sessionId: tab.sessionId,
              targetInfo: {
                targetId: tab.targetId,
                type: 'page',
                title: info?.title || '',
                url: info?.url || '',
                attached: true,
              },
              waitingForDebugger: false,
            },
          },
        })
      } catch {
        // ignore
      }
    }
    return
  }

  if (msg && typeof msg.id === 'number' && msg.method === 'forwardCDPCommand') {
    try {
      const result = await handleForwardCdpCommand(msg)
      sendToRelay({ id: msg.id, result })
    } catch (err) {
      sendToRelay({ id: msg.id, error: err instanceof Error ? err.message : String(err) })
    }
  }
}

// ── Tab management ──

function getTabBySessionId(sessionId) {
  const direct = tabBySession.get(sessionId)
  if (direct) return { tabId: direct, kind: 'main' }
  const child = childSessionToTab.get(sessionId)
  if (child) return { tabId: child, kind: 'child' }
  return null
}

function getTabByTargetId(targetId) {
  for (const [tabId, tab] of tabs.entries()) {
    if (tab.targetId === targetId) return tabId
  }
  return null
}

async function attachTab(tabId, opts = {}) {
  const debuggee = { tabId }
  await chrome.debugger.attach(debuggee, '1.3')
  await chrome.debugger.sendCommand(debuggee, 'Page.enable').catch(() => { })

  // Stage 1: Inject stealth script before any navigation
  await chrome.debugger.sendCommand(debuggee, 'Page.addScriptToEvaluateOnNewDocument', {
    source: STEALTH_SCRIPT,
  }).catch(() => { })

  const info = /** @type {any} */ (await chrome.debugger.sendCommand(debuggee, 'Target.getTargetInfo'))
  const targetInfo = info?.targetInfo
  const targetId = String(targetInfo?.targetId || '').trim()
  if (!targetId) {
    throw new Error('Target.getTargetInfo returned no targetId')
  }

  const sessionId = `cb-tab-${nextSession++}`
  const attachOrder = nextSession

  tabs.set(tabId, { state: 'connected', sessionId, targetId, attachOrder })
  tabBySession.set(sessionId, tabId)
  void chrome.action.setTitle({
    tabId,
    title: 'CDPilot: attached (click to detach)',
  })

  if (!opts.skipAttachedEvent) {
    sendToRelay({
      method: 'forwardCDPEvent',
      params: {
        method: 'Target.attachedToTarget',
        params: {
          sessionId,
          targetInfo: { ...targetInfo, attached: true },
          waitingForDebugger: false,
        },
      },
    })
  }

  setBadge(tabId, 'on')
  appendLog('info', `Attached tab ${tabId} (session: ${sessionId})`)

  // Stage 9: Persist tab URL for session restore
  try {
    const tabInfo = await chrome.tabs.get(tabId).catch(() => null)
    if (tabInfo?.url) {
      const stored = await chrome.storage.local.get(['sessionTabs'])
      const sessionTabs = stored.sessionTabs || {}
      sessionTabs[tabId] = tabInfo.url
      await chrome.storage.local.set({ sessionTabs })
    }
  } catch {
    // ignore
  }

  return { sessionId, targetId }
}

async function detachTab(tabId, reason) {
  const tab = tabs.get(tabId)
  if (tab?.sessionId && tab?.targetId) {
    try {
      sendToRelay({
        method: 'forwardCDPEvent',
        params: {
          method: 'Target.detachedFromTarget',
          params: { sessionId: tab.sessionId, targetId: tab.targetId, reason },
        },
      })
    } catch {
      // ignore
    }
  }

  if (tab?.sessionId) tabBySession.delete(tab.sessionId)
  tabs.delete(tabId)

  for (const [childSessionId, parentTabId] of childSessionToTab.entries()) {
    if (parentTabId === tabId) childSessionToTab.delete(childSessionId)
  }

  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    // ignore
  }

  setBadge(tabId, 'off')
  void chrome.action.setTitle({
    tabId,
    title: 'CDPilot (click to attach/detach)',
  })
  appendLog('info', `Detached tab ${tabId} (reason: ${reason})`)

  // Stage 9: Remove tab from session storage
  try {
    const stored = await chrome.storage.local.get(['sessionTabs'])
    const sessionTabs = stored.sessionTabs || {}
    delete sessionTabs[tabId]
    await chrome.storage.local.set({ sessionTabs })
  } catch {
    // ignore
  }
}

// ── Stage 3: Complete keyboard event chain (Plan D) ──

async function dispatchRealKey(debuggee, key, code, keyCode) {
  const common = { key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }
  await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
    type: 'keyDown',
    ...common,
  })
  await new Promise(r => setTimeout(r, 5 + Math.random() * 20))
  await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
    type: 'char',
    text: key,
    ...common,
  })
  await new Promise(r => setTimeout(r, 5 + Math.random() * 20))
  await chrome.debugger.sendCommand(debuggee, 'Input.dispatchKeyEvent', {
    type: 'keyUp',
    ...common,
  })
}

// ── Stage 4: Bezier curve mouse trajectory (Plan C) ──

function generateHumanMousePath(sx, sy, ex, ey) {
  const dist = Math.hypot(ex - sx, ey - sy)
  const steps = Math.max(10, Math.floor(dist / 5))

  // Random control points for cubic bezier
  const cp1x = sx + (ex - sx) * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * dist * 0.3
  const cp1y = sy + (ey - sy) * (0.2 + Math.random() * 0.3) + (Math.random() - 0.5) * dist * 0.3
  const cp2x = sx + (ex - sx) * (0.5 + Math.random() * 0.3) + (Math.random() - 0.5) * dist * 0.3
  const cp2y = sy + (ey - sy) * (0.5 + Math.random() * 0.3) + (Math.random() - 0.5) * dist * 0.3

  const path = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Ease in-out: slow at start and end, fast in middle
    const ease = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)

    const u = 1 - ease
    const x = u * u * u * sx + 3 * u * u * ease * cp1x + 3 * u * ease * ease * cp2x + ease * ease * ease * ex
    const y = u * u * u * sy + 3 * u * u * ease * cp1y + 3 * u * ease * ease * cp2y + ease * ease * ease * ey

    // Micro-jitter
    const jitterX = (Math.random() - 0.5) * 2
    const jitterY = (Math.random() - 0.5) * 2

    path.push({
      x: Math.round(x + jitterX),
      y: Math.round(y + jitterY),
      delay: 5 + Math.random() * 15,
    })
  }

  // 20% chance of overshoot correction
  if (Math.random() < 0.2) {
    const overshootDist = 5 + Math.random() * 15
    const angle = Math.atan2(ey - sy, ex - sx)
    path.push({
      x: Math.round(ex + Math.cos(angle) * overshootDist),
      y: Math.round(ey + Math.sin(angle) * overshootDist),
      delay: 10 + Math.random() * 20,
    })
    // Correct back
    path.push({ x: Math.round(ex), y: Math.round(ey), delay: 15 + Math.random() * 25 })
  }

  // Ensure final point is exact
  path[path.length - 1].x = Math.round(ex)
  path[path.length - 1].y = Math.round(ey)

  return path
}

// ── Stage 9: Session restore ──

async function restoreSession() {
  const stored = await chrome.storage.local.get(['sessionTabs'])
  const sessionTabs = stored.sessionTabs || {}
  const savedUrls = Object.values(sessionTabs)
  if (savedUrls.length === 0) return { restored: 0 }

  const allTabs = await chrome.tabs.query({})
  let restored = 0

  for (const tab of allTabs) {
    if (!tab.id || !tab.url) continue
    if (tabs.has(tab.id)) continue
    if (savedUrls.includes(tab.url)) {
      try {
        await attachTab(tab.id)
        restored++
      } catch (err) {
        appendLog('warn', `Session restore failed for tab ${tab.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  appendLog('info', `Session restore complete: ${restored} tab(s) restored`)
  return { restored }
}

// ── CDP command handling ──

async function connectOrToggleForActiveTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = active?.id
  if (!tabId) return

  const existing = tabs.get(tabId)
  if (existing?.state === 'connected') {
    await detachTab(tabId, 'toggle')
    return
  }

  tabs.set(tabId, { state: 'connecting' })
  setBadge(tabId, 'connecting')
  void chrome.action.setTitle({
    tabId,
    title: 'CDPilot: connecting to local relay…',
  })

  try {
    await ensureRelayConnection()
    await attachTab(tabId)
  } catch (err) {
    tabs.delete(tabId)
    setBadge(tabId, 'error')
    void chrome.action.setTitle({
      tabId,
      title: 'CDPilot: relay not running (open options for setup)',
    })
    void maybeOpenHelpOnce()
    const message = err instanceof Error ? err.message : String(err)
    appendLog('error', `Attach failed: ${message}`)
    console.warn('attach failed', message, nowStack())
  }
}

async function handleForwardCdpCommand(msg) {
  const method = String(msg?.params?.method || '').trim()
  const params = msg?.params?.params || undefined
  const sessionId = typeof msg?.params?.sessionId === 'string' ? msg.params.sessionId : undefined

  // Stage 2: Random delay for interaction commands
  if (INTERACTION_METHODS.has(method)) {
    await new Promise(r => setTimeout(r, 30 + Math.random() * 120))
  }

  // Stage 3: Custom method — complete keyboard event chain
  if (method === 'Input.dispatchRealKey') {
    const bySession = sessionId ? getTabBySessionId(sessionId) : null
    const tabId = bySession?.tabId || (() => {
      for (const [id, tab] of tabs.entries()) {
        if (tab.state === 'connected') return id
      }
      return null
    })()
    if (!tabId) throw new Error('No attached tab for Input.dispatchRealKey')
    const debuggee = { tabId }
    await dispatchRealKey(debuggee, params?.key || '', params?.code || '', params?.keyCode || 0)
    return {}
  }

  // Stage 4: Custom method — human mouse movement
  if (method === 'Input.humanMouseMove') {
    const sx = params?.startX ?? 0
    const sy = params?.startY ?? 0
    const ex = params?.endX ?? 0
    const ey = params?.endY ?? 0
    const dispatch = params?.dispatch !== false

    const path = generateHumanMousePath(sx, sy, ex, ey)

    if (dispatch) {
      const bySession = sessionId ? getTabBySessionId(sessionId) : null
      const tabId = bySession?.tabId || (() => {
        for (const [id, tab] of tabs.entries()) {
          if (tab.state === 'connected') return id
        }
        return null
      })()
      if (!tabId) throw new Error('No attached tab for Input.humanMouseMove')
      const debuggee = { tabId }

      for (const point of path) {
        await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: point.x,
          y: point.y,
        })
        await new Promise(r => setTimeout(r, point.delay))
      }
      return {}
    }

    return { path }
  }

  // Stage 9: Custom method — session restore
  if (method === 'Extension.restoreSession') {
    return await restoreSession()
  }

  // Stage 10: Custom method — get all attached tabs
  if (method === 'Extension.getTabs') {
    const list = []
    for (const [tabId, tab] of tabs.entries()) {
      if (tab.state === 'connected') {
        const info = await chrome.tabs.get(tabId).catch(() => null)
        list.push({
          sessionId: tab.sessionId,
          targetId: tab.targetId,
          url: info?.url || '',
          title: info?.title || '',
          type: 'page',
        })
      }
    }
    return list
  }

  // Map command to tab
  const bySession = sessionId ? getTabBySessionId(sessionId) : null
  const targetId = typeof params?.targetId === 'string' ? params.targetId : undefined
  const tabId =
    bySession?.tabId ||
    (targetId ? getTabByTargetId(targetId) : null) ||
    (() => {
      // No sessionId: pick the first connected tab (stable-ish).
      for (const [id, tab] of tabs.entries()) {
        if (tab.state === 'connected') return id
      }
      return null
    })()

  if (!tabId) throw new Error(`No attached tab for method ${method}`)

  /** @type {chrome.debugger.DebuggerSession} */
  const debuggee = { tabId }

  if (method === 'Runtime.enable') {
    try {
      await chrome.debugger.sendCommand(debuggee, 'Runtime.disable')
      await new Promise((r) => setTimeout(r, 50))
    } catch {
      // ignore
    }
    return await chrome.debugger.sendCommand(debuggee, 'Runtime.enable', params)
  }

  if (method === 'Target.createTarget') {
    const url = typeof params?.url === 'string' ? params.url : 'about:blank'
    const tab = await chrome.tabs.create({ url, active: false })
    if (!tab.id) throw new Error('Failed to create tab')
    await new Promise((r) => setTimeout(r, 100))
    const attached = await attachTab(tab.id)
    return { targetId: attached.targetId }
  }

  if (method === 'Target.closeTarget') {
    const target = typeof params?.targetId === 'string' ? params.targetId : ''
    const toClose = target ? getTabByTargetId(target) : tabId
    if (!toClose) return { success: false }
    try {
      await chrome.tabs.remove(toClose)
    } catch {
      return { success: false }
    }
    return { success: true }
  }

  if (method === 'Target.activateTarget') {
    const target = typeof params?.targetId === 'string' ? params.targetId : ''
    const toActivate = target ? getTabByTargetId(target) : tabId
    if (!toActivate) return {}
    const tab = await chrome.tabs.get(toActivate).catch(() => null)
    if (!tab) return {}
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => { })
    }
    await chrome.tabs.update(toActivate, { active: true }).catch(() => { })
    return {}
  }

  const tabState = tabs.get(tabId)
  const mainSessionId = tabState?.sessionId
  const debuggerSession =
    sessionId && mainSessionId && sessionId !== mainSessionId
      ? { ...debuggee, sessionId }
      : debuggee

  return await chrome.debugger.sendCommand(debuggerSession, method, params)
}

// ── Debugger event listeners ──

function onDebuggerEvent(source, method, params) {
  const tabId = source.tabId
  if (!tabId) return
  const tab = tabs.get(tabId)
  if (!tab?.sessionId) return

  if (method === 'Target.attachedToTarget' && params?.sessionId) {
    childSessionToTab.set(String(params.sessionId), tabId)
  }

  if (method === 'Target.detachedFromTarget' && params?.sessionId) {
    childSessionToTab.delete(String(params.sessionId))
  }

  try {
    sendToRelay({
      method: 'forwardCDPEvent',
      params: {
        sessionId: source.sessionId || tab.sessionId,
        method,
        params,
      },
    })
  } catch {
    // ignore
  }
}

function onDebuggerDetach(source, reason) {
  const tabId = source.tabId
  if (!tabId) return
  if (!tabs.has(tabId)) return
  void detachTab(tabId, reason)
}

// ── Event listeners ──

chrome.action.onClicked.addListener(() => void connectOrToggleForActiveTab())

chrome.runtime.onInstalled.addListener(() => {
  // Useful: first-time instructions.
  void chrome.runtime.openOptionsPage()
})

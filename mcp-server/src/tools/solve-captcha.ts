import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';
import { config } from '../config.js';

export const solveCaptchaSchema = z.object({
  site_key: z.string().describe('验证码站点 Key（从 detect_captcha 结果的 site_key 字段获取）'),
  page_url: z.string().describe('当前页面 URL'),
  captcha_type: z.string().optional().describe('可选，验证码类型：recaptcha_v2/recaptcha_v3/hcaptcha/cloudflare_turnstile/geetest；不填则自动检测'),
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

async function solve2Captcha(apiKey: string, captchaType: string, siteKey: string, pageUrl: string): Promise<string> {
  const method = captchaType === 'hcaptcha' ? 'hcaptcha'
    : captchaType === 'cloudflare_turnstile' ? 'turnstile'
    : 'userrecaptcha';

  // Step 1: Submit task
  const submitParams = new URLSearchParams({
    key: apiKey,
    method,
    googlekey: siteKey,
    pageurl: pageUrl,
    json: '1',
  });
  const submitResp = await fetch(`https://2captcha.com/in.php?${submitParams}`, { signal: AbortSignal.timeout(10000) });
  const submitData = await submitResp.json() as { status: number; request: string };
  if (submitData.status !== 1) {
    throw new Error(`2Captcha 提交失败: ${JSON.stringify(submitData)}`);
  }
  const taskId = submitData.request;

  // Step 2: Poll for result (max 120s)
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const resultResp = await fetch(
      `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${taskId}&json=1`,
      { signal: AbortSignal.timeout(10000) }
    );
    const resultData = await resultResp.json() as { status: number; request: string };
    if (resultData.status === 1) return resultData.request;
    if (resultData.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2Captcha 求解失败: ${JSON.stringify(resultData)}`);
    }
  }
  throw new Error('2Captcha 求解超时（120秒）');
}

async function solveCapsolver(apiKey: string, captchaType: string, siteKey: string, pageUrl: string): Promise<string> {
  const taskTypeMap: Record<string, string> = {
    recaptcha_v2: 'RecaptchaV2TaskProxyless',
    recaptcha_v3: 'RecaptchaV3TaskProxyless',
    hcaptcha: 'HCaptchaTaskProxyless',
    cloudflare_turnstile: 'AntiTurnstileTaskProxyless',
    geetest: 'GeetestTaskProxyless',
  };
  const taskType = taskTypeMap[captchaType] ?? 'RecaptchaV2TaskProxyless';

  // Step 1: Create task
  const createResp = await fetch('https://api.capsolver.com/createTask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: taskType, websiteURL: pageUrl, websiteKey: siteKey },
    }),
  });
  const createData = await createResp.json() as { errorCode?: string; taskId?: string };
  if (createData.errorCode) {
    throw new Error(`CapSolver 创建任务失败: ${JSON.stringify(createData)}`);
  }
  const taskId = createData.taskId;
  if (!taskId) throw new Error('CapSolver 未返回任务ID');

  // Step 2: Poll for result (max 120s)
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const resultResp = await fetch('https://api.capsolver.com/getTaskResult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    });
    const resultData = await resultResp.json() as {
      status?: string;
      errorCode?: string;
      solution?: Record<string, string>;
    };
    if (resultData.status === 'ready' && resultData.solution) {
      for (const key of ['gRecaptchaResponse', 'token', 'userAgent']) {
        if (resultData.solution[key]) return resultData.solution[key];
      }
    }
    if (resultData.errorCode) {
      throw new Error(`CapSolver 求解失败: ${JSON.stringify(resultData)}`);
    }
  }
  throw new Error('CapSolver 求解超时（120秒）');
}

async function injectToken(
  relay: RelayClient,
  sessionId: string,
  captchaType: string,
  token: string,
): Promise<void> {
  let script: string;
  if (captchaType === 'recaptcha_v2' || captchaType === 'recaptcha_v3') {
    script = `
      (function() {
        var el = document.getElementById('g-recaptcha-response');
        if (!el) {
          el = document.createElement('textarea');
          el.id = 'g-recaptcha-response';
          el.name = 'g-recaptcha-response';
          el.style.display = 'none';
          document.body.appendChild(el);
        }
        el.value = ${JSON.stringify(token)};
        if (window.___grecaptcha_cfg) {
          var clients = window.___grecaptcha_cfg.clients || {};
          for (var k in clients) {
            var c = clients[k];
            for (var j in c) { if (c[j] && typeof c[j].callback === 'function') { try { c[j].callback(${JSON.stringify(token)}); } catch(e){} } }
          }
        }
      })()
    `;
  } else if (captchaType === 'hcaptcha') {
    script = `
      (function() {
        var el = document.querySelector('[name="h-captcha-response"]');
        if (!el) {
          el = document.createElement('textarea');
          el.name = 'h-captcha-response';
          el.style.display = 'none';
          document.body.appendChild(el);
        }
        el.value = ${JSON.stringify(token)};
        if (window.hcaptcha && typeof window.hcaptcha.execute === 'function') { try { window.hcaptcha.execute(); } catch(e){} }
      })()
    `;
  } else if (captchaType === 'cloudflare_turnstile') {
    script = `
      (function() {
        var el = document.querySelector('[name="cf-turnstile-response"]');
        if (!el) {
          el = document.createElement('input');
          el.type = 'hidden';
          el.name = 'cf-turnstile-response';
          document.body.appendChild(el);
        }
        el.value = ${JSON.stringify(token)};
      })()
    `;
  } else {
    return; // Unsupported type, skip injection
  }

  await relay.sendCommand('Runtime.evaluate', {
    expression: script,
    returnByValue: true,
  }, sessionId);
}

export async function solveCaptcha(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof solveCaptchaSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);
  const provider = config.captchaProvider;
  const apiKey = config.captchaApiKey;

  if (!provider) {
    return {
      content: [{
        type: 'text' as const,
        text: '未配置验证码服务提供商。请设置环境变量 CAPTCHA_PROVIDER（2captcha 或 capsolver）和 CAPTCHA_API_KEY',
      }],
    };
  }
  if (!apiKey) {
    return {
      content: [{ type: 'text' as const, text: '未配置验证码服务 API Key。请设置环境变量 CAPTCHA_API_KEY' }],
    };
  }

  const captchaType = args.captcha_type ?? 'recaptcha_v2';

  let token: string;
  try {
    if (provider === '2captcha') {
      token = await solve2Captcha(apiKey, captchaType, args.site_key, args.page_url);
    } else if (provider === 'capsolver') {
      token = await solveCapsolver(apiKey, captchaType, args.site_key, args.page_url);
    } else {
      return {
        content: [{ type: 'text' as const, text: `不支持的验证码服务: ${provider}（支持: 2captcha, capsolver）` }],
      };
    }
  } catch (err) {
    return {
      content: [{ type: 'text' as const, text: `验证码求解失败: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }

  // Inject token into page
  try {
    await injectToken(relay, sessionId, captchaType, token);
  } catch {
    // Non-fatal: token injection failed but we still return the token
  }

  return {
    content: [{
      type: 'text' as const,
      text: `验证码求解成功\nToken: ${token.slice(0, 50)}...（已注入页面）`,
    }],
  };
}

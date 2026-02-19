import { z } from 'zod';
import type { RelayClient } from '../relay-client.js';
import type { SessionManager } from '../session-manager.js';

export const detectCaptchaSchema = z.object({
  sessionId: z.string().optional().describe('目标标签页会话ID（不填使用默认）'),
});

const DETECT_SCRIPT = `
(function() {
  // 1. reCAPTCHA v2
  var rcFrame = document.querySelector('iframe[src*="google.com/recaptcha"]');
  var rcDiv = document.querySelector('.g-recaptcha[data-sitekey]');
  if (rcFrame || rcDiv) {
    var sk = '';
    if (rcDiv) sk = rcDiv.getAttribute('data-sitekey') || '';
    if (!sk && rcFrame) { var m=(rcFrame.src||'').match(/[?&]k=([^&]+)/); if(m) sk=m[1]; }
    return JSON.stringify({found:true,type:'recaptcha_v2',selector:rcDiv?'.g-recaptcha':'iframe[src*="google.com/recaptcha"]',site_key:sk,details:'reCAPTCHA v2 checkbox detected',suggested_action:'solve_with_service'});
  }

  // 2. reCAPTCHA v3
  var rcv3 = document.querySelector('script[src*="recaptcha/api.js?render="]');
  if (rcv3) {
    var m2=(rcv3.src||'').match(/render=([^&]+)/);
    return JSON.stringify({found:true,type:'recaptcha_v3',selector:'script[src*="recaptcha/api.js"]',site_key:m2?m2[1]:'',details:'reCAPTCHA v3 score-based detected',suggested_action:'stealth_may_bypass'});
  }

  // 3. hCaptcha
  var hcFrame = document.querySelector('iframe[src*="hcaptcha.com"]');
  var hcDiv = document.querySelector('.h-captcha');
  if (hcFrame || hcDiv) {
    var sk2 = hcDiv ? (hcDiv.getAttribute('data-sitekey')||'') : '';
    return JSON.stringify({found:true,type:'hcaptcha',selector:hcDiv?'.h-captcha':'iframe[src*="hcaptcha.com"]',site_key:sk2,details:'hCaptcha detected',suggested_action:'solve_with_service'});
  }

  // 4. Cloudflare Turnstile
  var cfTs = document.querySelector('.cf-turnstile');
  var cfTsScript = document.querySelector('script[src*="turnstile"]');
  var cfTsData = document.querySelector('[data-sitekey][data-theme]');
  if (cfTs || cfTsScript || cfTsData) {
    var sk3 = cfTs?(cfTs.getAttribute('data-sitekey')||''):cfTsData?(cfTsData.getAttribute('data-sitekey')||''):'';
    return JSON.stringify({found:true,type:'cloudflare_turnstile',selector:cfTs?'.cf-turnstile':'[data-sitekey][data-theme]',site_key:sk3,details:'Cloudflare Turnstile detected',suggested_action:'click_element'});
  }

  // 5. Cloudflare JS Challenge
  var cfChallenge = document.querySelector('#challenge-form') || document.querySelector('#cf-challenge-running');
  var bodyClass = document.body ? document.body.className : '';
  if (cfChallenge || bodyClass.includes('challenge')) {
    return JSON.stringify({found:true,type:'cloudflare_challenge',selector:'#challenge-form',site_key:'',details:'Cloudflare JS Challenge page detected',suggested_action:'stealth_may_bypass'});
  }

  // 6. Geetest
  var gtPanel = document.querySelector('.geetest_panel') || document.querySelector('.geetest_slider_button') || document.querySelector('[gt-type]');
  if (gtPanel) {
    return JSON.stringify({found:true,type:'geetest',selector:'.geetest_panel',site_key:'',details:'Geetest CAPTCHA detected',suggested_action:'solve_with_service'});
  }
  var gtCaptcha = document.querySelector('#captcha');
  if (gtCaptcha && (gtCaptcha.getAttribute('gt') || document.querySelector('[gt]'))) {
    return JSON.stringify({found:true,type:'geetest',selector:'#captcha',site_key:'',details:'Geetest CAPTCHA detected',suggested_action:'solve_with_service'});
  }

  // 7. 滑块验证码
  var slider = document.querySelector('.slide-verify') || document.querySelector('#nc_1_n1z') || document.querySelector('.drag-captcha');
  if (!slider) {
    var els = document.querySelectorAll('[class*="slider"]');
    for (var i=0;i<els.length;i++) {
      var cls = els[i].className || '';
      if (cls.includes('captcha') || cls.includes('verify') || cls.includes('drag')) { slider = els[i]; break; }
    }
  }
  if (slider) {
    var sel = slider.id ? '#'+slider.id : (slider.className?'.'+slider.className.trim().split(/\\s+/)[0]:'div');
    return JSON.stringify({found:true,type:'slider',selector:sel,site_key:'',details:'Slider CAPTCHA detected',suggested_action:'simulate_drag'});
  }

  // 8. 图片验证码
  var imgCaptcha = document.querySelector('img[src*="captcha"]') || document.querySelector('img[src*="vcode"]') || document.querySelector('img[src*="kaptcha"]') || document.querySelector('img[alt*="captcha" i]') || document.querySelector('img[id*="captcha" i]');
  if (imgCaptcha) {
    var sel2 = imgCaptcha.src.includes('captcha')?'img[src*="captcha"]':'img[src*="vcode"]';
    return JSON.stringify({found:true,type:'image_captcha',selector:sel2,site_key:'',details:'Image CAPTCHA detected',suggested_action:'screenshot_and_ocr'});
  }

  // 9. 点选验证码
  var clickText = document.body ? document.body.innerText : '';
  if ((clickText.includes('点击') || clickText.includes('点选')) && document.querySelector('canvas')) {
    return JSON.stringify({found:true,type:'click_captcha',selector:'canvas',site_key:'',details:'Click-to-verify CAPTCHA detected',suggested_action:'screenshot_and_ocr'});
  }

  // 10. 通用检测
  var pageText = (document.body ? document.body.innerText : '').toLowerCase();
  var pageHTML = (document.documentElement ? document.documentElement.innerHTML : '').toLowerCase();
  if (pageText.includes('captcha') || pageText.includes('验证码') || pageText.includes('人机验证') || pageText.includes('robot') || pageHTML.includes('captcha') || pageHTML.includes('recaptcha')) {
    return JSON.stringify({found:true,type:'generic',selector:'',site_key:'',details:'Generic CAPTCHA text detected on page',suggested_action:'screenshot_and_ocr'});
  }

  return JSON.stringify({found:false,type:'',selector:'',site_key:'',details:'No CAPTCHA detected',suggested_action:''});
})()`;

export async function detectCaptcha(
  relay: RelayClient,
  sessions: SessionManager,
  args: z.infer<typeof detectCaptchaSchema>,
) {
  const sessionId = sessions.resolveSessionId(args.sessionId);

  // Also get page URL
  const [detectResult, urlResult] = await Promise.all([
    relay.sendCommand('Runtime.evaluate', {
      expression: DETECT_SCRIPT,
      returnByValue: true,
    }, sessionId) as Promise<{ result?: { value?: string } }>,
    relay.sendCommand('Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true,
    }, sessionId) as Promise<{ result?: { value?: string } }>,
  ]);

  const rawStr = detectResult?.result?.value ?? '{}';
  const pageUrl = urlResult?.result?.value ?? '';

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawStr);
  } catch {
    return { content: [{ type: 'text' as const, text: '验证码检测失败' }] };
  }

  parsed.page_url = pageUrl;

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(parsed, null, 2),
    }],
  };
}

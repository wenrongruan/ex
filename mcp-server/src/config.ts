function parsePort(envVar: string, raw: string | undefined, defaultVal: number): number {
  if (raw === undefined) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1 || n > 65535) {
    throw new Error(`${envVar} must be a valid port number (1-65535), got: ${raw}`);
  }
  return n;
}

export const config = {
  relayHost: process.env.RELAY_HOST ?? '127.0.0.1',
  relayPort: parsePort('RELAY_PORT', process.env.RELAY_PORT, 18792),
  relayEndpoint: process.env.RELAY_ENDPOINT ?? '/client',
  relayToken: process.env.RELAY_TOKEN ?? '',
  httpPort: parsePort('HTTP_PORT', process.env.HTTP_PORT, 3000),
  captchaProvider: process.env.CAPTCHA_PROVIDER ?? '',  // 2captcha 或 capsolver
  captchaApiKey: process.env.CAPTCHA_API_KEY ?? '',
};

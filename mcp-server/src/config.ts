export const config = {
  relayHost: process.env.RELAY_HOST ?? '127.0.0.1',
  relayPort: parseInt(process.env.RELAY_PORT ?? '18792', 10),
  relayEndpoint: process.env.RELAY_ENDPOINT ?? '/client',
  relayToken: process.env.RELAY_TOKEN ?? '',
  httpPort: parseInt(process.env.HTTP_PORT ?? '3000', 10),
};

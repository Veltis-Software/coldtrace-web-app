import http from 'node:http';
import https from 'node:https';

function listen(upstreamUrl, port, allowInternal) {
  const gateway = new URL(upstreamUrl);
  if (gateway.protocol !== 'https:' || !gateway.hostname.endsWith('.run.app')) {
    throw new Error('GATEWAY_URL must identify a Cloud Run service');
  }

  const metadata = new URL('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity');
  metadata.searchParams.set('audience', gateway.origin);

  http.createServer(async (request, response) => {
    if (!request.url?.startsWith('/api/') && !(allowInternal && request.url?.startsWith('/internal/'))) {
      response.writeHead(404).end();
      return;
    }

    try {
      const result = await fetch(metadata, {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(4000),
      });
      if (!result.ok) throw new Error('Cloud Run identity token unavailable');
      const token = (await result.text()).trim();
      const headers = {
        ...request.headers,
        host: gateway.host,
        'x-serverless-authorization': 'Bearer ' + token,
      };

      const upstream = https.request({
        hostname: gateway.hostname,
        method: request.method,
        path: request.url,
        headers,
      }, (incoming) => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      });
      upstream.on('error', () => {
        if (response.headersSent) response.destroy();
        else response.writeHead(502).end();
      });
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
    } catch {
      response.writeHead(502).end();
    }
  }).listen(port, '0.0.0.0');
}

if (process.env.GATEWAY_URL) {
  listen(process.env.GATEWAY_URL, 8081, false);
} else {
  const upstreams = JSON.parse(process.env.COLDTRACE_PRIVATE_UPSTREAMS);
  for (const [port, url] of Object.entries(upstreams)) {
    listen(url, Number(port), true);
  }
}

// Proxy API requests to the Workers backend
// This Pages Function handles GET, POST, PATCH, DELETE etc.
// _redirects with status 200 only works for GET, so this function is needed.

const WORKER_URL = 'https://school-sos-backend.phumiphatasunee478.workers.dev';

export async function onRequest(context: EventContext<any, any, any>): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = `${WORKER_URL}${url.pathname}${url.search}`;

  const proxyHeaders = new Headers(request.headers);
  proxyHeaders.delete('host');

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: proxyHeaders,
    body: request.body,
  });

  return fetch(proxyRequest);
}

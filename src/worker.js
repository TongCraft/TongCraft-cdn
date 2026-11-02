// Existing files are served directly by Workers Static Assets. Only misses and
// unsupported methods reach this handler, so error responses must not inherit
// the immutable cache policy of /assets/*.
/** @satisfies {ExportedHandler} */
export default {
  fetch(request) {
    const read = request.method === 'GET' || request.method === 'HEAD';
    return new Response(request.method === 'HEAD' ? null : read ? 'Not found' : 'Method not allowed', {
      status: read ? 404 : 405,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(read ? {} : { Allow: 'GET, HEAD' })
      }
    });
  }
};

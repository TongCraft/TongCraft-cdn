export const CACHE_CONTROL = {
  immutable: 'public, max-age=31536000, immutable',
  image: 'public, max-age=300, stale-while-revalidate=3600',
  metadata: 'public, max-age=60, stale-while-revalidate=300',
  html: 'public, max-age=0, must-revalidate'
};

export function staticHeaders() {
  return [
    '/*',
    '  X-Content-Type-Options: nosniff',
    ...[
      ['/assets/*', CACHE_CONTROL.immutable],
      ['/avatars/*', CACHE_CONTROL.image],
      ['/skins/*', CACHE_CONTROL.image],
      ['/players.json', CACHE_CONTROL.metadata],
      ['/3d/*.json', CACHE_CONTROL.metadata]
    ].flatMap(([pattern, policy]) => [
      pattern,
      '  Cache-Control: ' + policy,
      '  Access-Control-Allow-Origin: *'
    ]),
    ''
  ].join('\n');
}

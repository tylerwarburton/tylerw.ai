import type { Env } from '../functions/api/_lib';

export async function resolveSecrets(env: Env, method: string, path: string): Promise<Env> {
  const resolved = { ...env };
  if (method !== 'POST') return resolved;
  if (path.replace(/\/$/, '') === '/api/wall') {
    if (!resolved.DEMO_ADMIN_KEY && env.DEMO_ADMIN_SECRET) {
      resolved.DEMO_ADMIN_KEY = await env.DEMO_ADMIN_SECRET.get();
    }
  } else if (!resolved.OPENROUTER_API_KEY && env.OPENROUTER_SECRET) {
    resolved.OPENROUTER_API_KEY = await env.OPENROUTER_SECRET.get();
  }
  return resolved;
}

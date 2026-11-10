import { env } from '../config/env';
import { LocalRepo } from './local';
import type { Repo } from './repo';
import { SupabaseRepo } from './supabase';

let instance: Repo | null = null;

/** Returns the configured repository (singleton per server instance). */
export function db(): Repo {
  if (instance) return instance;
  if (env.dataBackend === 'supabase') {
    if (!env.supabaseUrl || !env.supabaseServiceKey) {
      throw new Error('DATA_BACKEND=supabase but SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.');
    }
    instance = new SupabaseRepo(env.supabaseUrl, env.supabaseServiceKey);
  } else {
    if (env.isProduction && !process.env.ALLOW_LOCAL_DB_IN_PRODUCTION) {
      throw new Error('The local development store cannot be used in production. Configure Supabase (see docs/DEPLOYMENT.md).');
    }
    instance = new LocalRepo(env.localDbPath);
  }
  return instance;
}

/** Test hook – inject a repository. */
export function setDb(repo: Repo | null) {
  instance = repo;
}

export type { Repo } from './repo';

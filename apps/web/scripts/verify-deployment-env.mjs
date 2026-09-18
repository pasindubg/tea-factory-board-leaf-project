// Refuse a build before migrations if Git, Vercel and Neon disagree.
export function verifyDeploymentEnv(env) {
  if (!env.VERCEL_ENV || env.VERCEL_ENV === 'development') return;
  const targets = {
    preview: { git: 'main', endpoint: 'ep-patient-silence-azg78q0i' },
    production: { git: 'blm-cloud-release', endpoint: 'ep-sweet-river-azg84cej' },
  };
  const target = targets[env.VERCEL_ENV];
  if (!target || env.VERCEL_GIT_COMMIT_REF !== target.git) {
    throw new Error('Git branch does not match the configured Vercel environment.');
  }
  if (env.NEXT_PUBLIC_DATA_BACKEND !== 'neon') throw new Error('Deployment requires NEXT_PUBLIC_DATA_BACKEND=neon.');
  const suffix = 'c-3.ap-southeast-1.aws.neon.tech';
  for (const key of ['NEON_DATABASE_URL', 'NEON_AUTH_BASE_URL', 'NEXT_PUBLIC_NEON_AUTH_BASE_URL', 'NEXT_PUBLIC_NEON_DATA_API_URL']) {
    let url;
    try { url = new URL(env[key]); } catch { throw new Error(`${key} is missing or invalid.`); }
    const kind = key.includes('AUTH') ? 'auth' : key.includes('DATA_API') ? 'data' : 'db';
    const hosts = kind === 'auth' ? [`${target.endpoint}.neonauth.${suffix}`]
      : kind === 'data' ? [`${target.endpoint}.apirest.${suffix}`]
      : [`${target.endpoint}.${suffix}`, `${target.endpoint}-pooler.${suffix}`];
    const path = kind === 'auth' ? '/neondb/auth' : kind === 'data' ? '/neondb/rest/v1' : '/neondb';
    if (!hosts.includes(url.hostname) || url.pathname.replace(/\/$/, '') !== path ||
        !(kind === 'db' ? ['postgres:', 'postgresql:'] : ['https:']).includes(url.protocol)) {
      throw new Error(`${key} does not target the expected Neon ${env.VERCEL_ENV} branch.`);
    }
  }
}

export function migrationDatabaseUrl(env) {
  verifyDeploymentEnv(env);
  const url = new URL(env.NEON_DATABASE_URL);
  url.hostname = url.hostname.replace('-pooler.', '.');
  return url.toString();
}

if (process.argv[1]?.endsWith('/verify-deployment-env.mjs')) {
  if (process.argv.includes('--migration-url')) {
    process.stdout.write(migrationDatabaseUrl(process.env));
  } else {
    verifyDeploymentEnv(process.env);
    console.log('Deployment environment mapping verified.');
  }
}

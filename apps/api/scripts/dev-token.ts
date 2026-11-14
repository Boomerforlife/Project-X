import { SignJWT } from 'jose';

/** Usage: npm run token -w @projectx/api -- --user <uuid> [--admin] [--email x] [--anonymous] */
const args = process.argv.slice(2);
const val = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const user = val('--user');
if (!user) {
  console.error('usage: token --user <uuid> [--admin] [--email e] [--anonymous]');
  process.exit(2);
}
const secret = new TextEncoder().encode(process.env['TEST_JWT_SECRET'] ?? 'dev-test-secret-change-me-32-chars-min');
const email = val('--email');
const token = await new SignJWT({
  role: 'authenticated',
  ...(email ? { email } : {}),
  ...(args.includes('--anonymous') ? { is_anonymous: true } : {}),
})
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject(user)
  .setAudience('authenticated')
  .setIssuedAt()
  .setExpirationTime('12h')
  .sign(secret);
console.log(token);
if (args.includes('--admin')) {
  console.error(`note: roles come from the DB: insert into public.user_roles(user_id, role) values ('${user}','ADMIN');`);
}

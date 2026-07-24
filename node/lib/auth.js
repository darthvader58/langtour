import { db } from './db/db.js';

export async function requireUser(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }
  const { data, error } = await db.auth.getUser(match[1]);
  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  req.userId = data.user.id;
  // The verified token already carries the user's identity (email, metadata,
  // created_at). Stash it so routes never need a second service-role Admin API
  // round trip to re-fetch what we just authenticated.
  req.authUser = data.user;
  next();
}

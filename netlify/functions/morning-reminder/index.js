const webpush = require('web-push');

const PROJECT_ID = 'dog-feeder-69516';
const API_KEY    = 'AIzaSyDYzGbNv_sZpfLFuJiQEpV3qzIvNb0kjIA';
const BASE      = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)`;
const APP_URL   = 'https://dogfeeder.netlify.app';

exports.handler = async () => {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('VAPID keys not configured');
    return { statusCode: 500 };
  }

  // ── 1. Check if morning feed already logged today ──
  const now        = new Date();
  const todayStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()).toISOString();
  const tomStart   = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1).toISOString();

  const queryBody = {
    structuredQuery: {
      from: [{ collectionId: 'feedings' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'mealTime' },   op: 'EQUAL',                value: { stringValue:   'morning'    } } },
            { fieldFilter: { field: { fieldPath: 'timestamp' },  op: 'GREATER_THAN_OR_EQUAL', value: { timestampValue: todayStart } } },
            { fieldFilter: { field: { fieldPath: 'timestamp' },  op: 'LESS_THAN',             value: { timestampValue: tomStart   } } },
          ],
        },
      },
      limit: 1,
    },
  };

  try {
    const qRes  = await fetch(`${BASE}/documents:runQuery?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody),
    });
    const qData = await qRes.json();
    const wasFed = Array.isArray(qData) && qData.some(r => r.document);
    if (wasFed) {
      console.log('Morning feed already done — no reminder needed.');
      return { statusCode: 200, body: 'Already fed' };
    }
  } catch (e) {
    console.error('Firestore query failed:', e.message);
    return { statusCode: 500 };
  }

  // ── 2. Get dog name from config ────────────────────
  let dogName = 'your dog';
  try {
    const cfgRes  = await fetch(`${BASE}/documents/app/config?key=${API_KEY}`);
    const cfgData = await cfgRes.json();
    dogName = cfgData.fields?.dogName?.stringValue ?? dogName;
  } catch {}

  // ── 3. Load all push subscriptions ────────────────
  let documents = [];
  try {
    const subRes  = await fetch(`${BASE}/documents/subscriptions?key=${API_KEY}&pageSize=100`);
    const subData = await subRes.json();
    documents = subData.documents ?? [];
  } catch (e) {
    console.error('Could not load subscriptions:', e.message);
    return { statusCode: 500 };
  }

  if (!documents.length) {
    console.log('No subscribers registered.');
    return { statusCode: 200, body: 'No subscribers' };
  }

  // ── 4. Send push to everyone ───────────────────────
  webpush.setVapidDetails(
    'mailto:admin@dogfeeder.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({
    title: `${dogName} needs breakfast! 🍽️`,
    body:  `${dogName} hasn't been fed yet this morning — who's on it?`,
    url:   `${APP_URL}/#feed`,
  });

  const sends = documents
    .map(d => {
      const f = d.fields ?? {};
      const endpoint = f.endpoint?.stringValue;
      if (!endpoint) return null;
      return webpush.sendNotification(
        { endpoint, keys: { p256dh: f.p256dh?.stringValue ?? '', auth: f.auth?.stringValue ?? '' } },
        payload
      ).catch(() => {});
    })
    .filter(Boolean);

  await Promise.allSettled(sends);
  console.log(`Morning reminder sent to ${sends.length} device(s).`);
  return { statusCode: 200, body: JSON.stringify({ notified: sends.length }) };
};

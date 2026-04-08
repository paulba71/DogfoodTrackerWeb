const webpush = require('web-push');

const FIREBASE_PROJECT_ID = 'dog-feeder-69516';
const FIREBASE_API_KEY    = 'AIzaSyDYzGbNv_sZpfLFuJiQEpV3qzIvNb0kjIA';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { payload, senderEndpoint } = JSON.parse(event.body ?? '{}');

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'VAPID keys not configured' }) };
  }

  webpush.setVapidDetails(
    'mailto:admin@dogfeeder.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  // Read all push subscriptions from Firestore via REST API
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/subscriptions?key=${FIREBASE_API_KEY}&pageSize=100`;

  let documents = [];
  try {
    const res  = await fetch(url);
    const data = await res.json();
    documents  = data.documents ?? [];
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }

  const sends = documents
    .map(docObj => {
      const f        = docObj.fields ?? {};
      const endpoint = f.endpoint?.stringValue;
      if (!endpoint || endpoint === senderEndpoint) return null;

      const subscription = {
        endpoint,
        keys: {
          p256dh: f.p256dh?.stringValue ?? '',
          auth:   f.auth?.stringValue   ?? '',
        },
      };

      return webpush
        .sendNotification(subscription, JSON.stringify(payload))
        .catch(() => {}); // silently skip expired / unreachable subscriptions
    })
    .filter(Boolean);

  await Promise.allSettled(sends);
  return { statusCode: 200, body: JSON.stringify({ sent: sends.length }) };
};

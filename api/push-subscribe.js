// 푸시 구독 등록/갱신/해제/테스트 API
const {
  getRedis, initWebPush, subId, subKey, sanitizePrefs, validSubscription,
  kstNow, buildDailyMessage, sendOne
} = require('../lib/push');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    // 클라이언트가 구독할 때 쓰는 공개키
    if (req.method === 'GET') {
      return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: '허용되지 않는 요청입니다.' });

    // 같은 사이트에서 온 요청만 허용
    const origin = req.headers.origin;
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch (e) { /* ignore */ }
      if (originHost !== req.headers.host) return res.status(403).json({ error: '허용되지 않는 출처입니다.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const redis = getRedis();

    if (body.action === 'subscribe' || body.action === 'update') {
      if (!validSubscription(body.subscription)) return res.status(400).json({ error: '잘못된 구독 정보입니다.' });
      const prefs = sanitizePrefs(body.prefs);
      const id = subId(body.subscription.endpoint);
      const existing = await redis.get(subKey(id));
      await redis.set(subKey(id), {
        sub: body.subscription,
        prefs,
        lastSent: existing && existing.lastSent ? existing.lastSent : '',
        updated: Date.now()
      });
      await redis.sadd('push:subs', id);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'unsubscribe') {
      if (typeof body.endpoint !== 'string') return res.status(400).json({ error: '잘못된 요청입니다.' });
      const id = subId(body.endpoint);
      await redis.del(subKey(id));
      await redis.srem('push:subs', id);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'test') {
      if (typeof body.endpoint !== 'string') return res.status(400).json({ error: '잘못된 요청입니다.' });
      initWebPush();
      const id = subId(body.endpoint);
      const record = await redis.get(subKey(id));
      if (!record) return res.status(404).json({ error: '구독 정보가 없어요. 알림을 껐다가 다시 켜 주세요.' });
      const now = kstNow();
      const message = await buildDailyMessage(record.prefs, now.ymd, now.dow, new Map(), { force: true });
      message.title = `[테스트] ${message.title}`;
      const result = await sendOne(redis, id, record, message);
      if (result !== 'sent') return res.status(502).json({ error: '알림 전송에 실패했어요.' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: '알 수 없는 요청입니다.' });
  } catch (e) {
    console.error('push-subscribe 오류:', e);
    return res.status(500).json({ error: e.message || '서버 오류' });
  }
};

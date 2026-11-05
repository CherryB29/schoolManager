// 아침 알림 발송 (Vercel Cron 또는 외부 스케줄러가 호출)
//   /api/push-cron?all=1        → 시간 설정과 무관하게 전체 발송 (하루 1회 크론용)
//   /api/push-cron?window=30    → 사용자가 정한 시간이 "지금 기준 최근 30분 이내"인 사람만 발송 (10분마다 호출용)
//   같은 날 두 번 보내지 않도록 lastSent 로 막기 때문에, 호출이 조금 늦어져도 안전합니다.
const {
  getRedis, initWebPush, subKey, kstNow, buildDailyMessage, sendOne
} = require('../lib/push');

function minutesOf(time) {
  const [h, m] = String(time || '07:30').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // 인증: Vercel Cron 은 CRON_SECRET 이 있으면 자동으로 Authorization 헤더를 붙입니다.
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET 환경변수를 설정해 주세요.' });
  const authorized = req.headers.authorization === `Bearer ${secret}` || req.query.key === secret;
  if (!authorized) return res.status(401).json({ error: 'unauthorized' });

  try {
    initWebPush();
    const redis = getRedis();
    const now = kstNow();
    const all = req.query.all === '1';
    const windowMin = Math.max(1, Math.min(120, parseInt(req.query.window, 10) || 30));

    if (!all && (now.dow === 0 || now.dow === 6)) {
      return res.status(200).json({ skipped: 'weekend' });
    }

    // push:times (id -> "HH:MM") 덕분에, 시간이 안 된 사람은 기록을 읽지 않고 건너뜁니다.
    const [idsRaw, timesRaw] = await Promise.all([redis.smembers('push:subs'), redis.hgetall('push:times')]);
    const ids = idsRaw || [];
    const times = timesRaw || {};
    const ctx = new Map();
    const hh = String(Math.floor(now.minutes / 60)).padStart(2, '0');
    const mm = String(now.minutes % 60).padStart(2, '0');
    // 진단용: skipped 가 왜 생겼는지 이유별로 셉니다.
    const stats = {
      nowKst: `${hh}:${mm}`, total: ids.length, sent: 0, skipped: 0, removed: 0, failed: 0,
      alreadySent: 0, notDue: 0, noMessage: 0
    };

    const handle = async id => {
      if (!all && times[id]) {
        const d = now.minutes - minutesOf(times[id]);
        if (d < 0 || d >= windowMin) { stats.skipped++; stats.notDue++; return; }
      }
      const record = await redis.get(subKey(id));
      if (!record || !record.sub || !record.prefs) {
        await redis.srem('push:subs', id);
        stats.removed++;
        return;
      }
      if (!times[id]) await redis.hset('push:times', { [id]: record.prefs.time || '07:30' }); // 예전 기록 보정
      if (record.lastSent === now.ymd) { stats.skipped++; stats.alreadySent++; return; }
      if (!all) {
        const diff = now.minutes - minutesOf(record.prefs.time);
        if (diff < 0 || diff >= windowMin) { stats.skipped++; stats.notDue++; return; }
      }
      const message = await buildDailyMessage(record.prefs, now.ymd, now.dow, ctx);
      if (!message) { stats.skipped++; stats.noMessage++; return; }
      const result = await sendOne(redis, id, record, message);
      if (result === 'sent') {
        record.lastSent = now.ymd;
        await redis.set(subKey(id), record);
        stats.sent++;
      } else if (result === 'gone') {
        stats.removed++;
      } else {
        stats.failed++;
      }
    };

    for (let i = 0; i < ids.length; i += 10) {
      await Promise.all(ids.slice(i, i + 10).map(id => handle(id).catch(e => { console.error(e); stats.failed++; })));
    }
    return res.status(200).json(stats);
  } catch (e) {
    console.error('push-cron 오류:', e);
    return res.status(500).json({ error: e.message || '서버 오류' });
  }
};

// 푸시 알림 공용 로직 (Vercel 서버리스, CommonJS)
const webpush = require('web-push');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

const TYPES = ['elsTimetable', 'misTimetable', 'hisTimetable'];

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('Redis(Upstash) 환경변수가 설정되지 않았어요.');
  return new Redis({ url, token });
}

function initWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error('VAPID 키가 설정되지 않았어요.');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', pub, priv);
}

function subId(endpoint) {
  return crypto.createHash('sha256').update(String(endpoint)).digest('hex').slice(0, 32);
}
const subKey = id => `push:sub:${id}`;

/* ---------- 입력 검증 ---------- */
function sanitizePrefs(p) {
  p = p || {};
  const out = {
    atpt: String(p.atpt || ''),
    schul: String(p.schul || ''),
    type: String(p.type || ''),
    schoolName: String(p.schoolName || '').slice(0, 40),
    grade: String(p.grade || ''),
    cls: String(p.cls || ''),
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time || '') ? p.time : '07:30',
    meal: p.meal !== false,
    pool: {}
  };
  if (!/^[A-Za-z0-9]{1,10}$/.test(out.atpt)) throw new Error('잘못된 교육청 코드');
  if (!/^\d{1,12}$/.test(out.schul)) throw new Error('잘못된 학교 코드');
  if (!TYPES.includes(out.type)) throw new Error('잘못된 학교 유형');
  if (!/^[1-6]$/.test(out.grade)) throw new Error('잘못된 학년');
  if (!/^\d{1,2}$/.test(out.cls)) throw new Error('잘못된 반');
  if (p.pool && typeof p.pool === 'object') {
    Object.entries(p.pool).slice(0, 300).forEach(([key, value]) => {
      if (typeof key !== 'string' || key.length > 60 || !value || typeof value !== 'object') return;
      out.pool[key] = {
        newSubject: String(value.newSubject || '').slice(0, 40),
        movingClass: String(value.movingClass || '').slice(0, 4)
      };
    });
  }
  return out;
}

function validSubscription(sub) {
  return sub && typeof sub.endpoint === 'string' && sub.endpoint.startsWith('https://') && sub.endpoint.length < 800 &&
    sub.keys && typeof sub.keys.p256dh === 'string' && typeof sub.keys.auth === 'string';
}

/* ---------- 시간 (KST) ---------- */
function kstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    ymd: `${y}${String(m).padStart(2, '0')}${String(day).padStart(2, '0')}`,
    dow: d.getUTCDay(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes()
  };
}

/* ---------- NEIS ---------- */
async function neis(path, params) {
  const key = process.env.NEIS_API_KEY || process.env.NEIS_KEY;
  if (!key) throw new Error('NEIS API 키 환경변수(NEIS_API_KEY)가 없어요.');
  const qs = new URLSearchParams({ KEY: key, Type: 'json', pIndex: '1', pSize: '100', ...params });
  const res = await fetch(`https://open.neis.go.kr/hub/${path}?${qs}`);
  return res.json();
}
function rowsOf(json, name) {
  const rows = json && json[name] && json[name][1] && json[name][1].row;
  return rows ? (Array.isArray(rows) ? rows : [rows]) : [];
}
function memo(map, key, fn) {
  if (!map.has(key)) map.set(key, fn());
  return map.get(key);
}

/* 오늘 알림 메시지 만들기. 보낼 게 없으면 null (주말/쉬는 날/시간표 없음) */
async function buildDailyMessage(prefs, ymd, dow, ctx, opts) {
  opts = opts || {};
  ctx = ctx || new Map();

  if (!opts.force && (dow === 0 || dow === 6)) return null;

  const events = await memo(ctx, `sch:${prefs.atpt}:${prefs.schul}:${ymd}`, () =>
    neis('SchoolSchedule', { ATPT_OFCDC_SC_CODE: prefs.atpt, SD_SCHUL_CODE: prefs.schul, AA_FROM_YMD: ymd, AA_TO_YMD: ymd })
      .then(json => rowsOf(json, 'SchoolSchedule'))
      .catch(() => [])
  );
  const off = events.find(e => /휴업|공휴/.test(String(e.SBTR_DD_SC_NM || '')));
  if (off && !opts.force) return null;

  const rows = await memo(ctx, `tt:${prefs.type}:${prefs.schul}:${prefs.grade}:${prefs.cls}:${ymd}`, () =>
    neis(prefs.type, {
      ATPT_OFCDC_SC_CODE: prefs.atpt, SD_SCHUL_CODE: prefs.schul, ALL_TI_YMD: ymd,
      GRADE: prefs.grade, CLASS_NM: prefs.cls
    }).then(json => rowsOf(json, prefs.type)).catch(() => [])
  );
  if (!rows.length && !opts.force) return null;
  rows.sort((a, b) => parseInt(a.PERIO, 10) - parseInt(b.PERIO, 10));

  const subjects = rows.map(r => {
    const name = String(r.ITRT_CNTNT || '').trim();
    const moving = prefs.pool && prefs.pool[`${prefs.cls}-${name}`];
    const label = moving ? `${moving.newSubject}(${moving.movingClass}반)` : (name || '공강');
    return `${parseInt(r.PERIO, 10)} ${label}`;
  });

  let body = subjects.length ? subjects.join(' · ') : '오늘은 등록된 시간표가 없어요.';

  if (prefs.meal) {
    const meal = await memo(ctx, `meal:${prefs.atpt}:${prefs.schul}:${ymd}`, () =>
      neis('mealServiceDietInfo', { ATPT_OFCDC_SC_CODE: prefs.atpt, SD_SCHUL_CODE: prefs.schul, MLSV_YMD: ymd })
        .then(json => rowsOf(json, 'mealServiceDietInfo'))
        .catch(() => [])
    );
    const row = meal.find(r => String(r.MMEAL_SC_NM || '').trim() === '중식') || meal[0];
    if (row) {
      const lines = String(row.DDISH_NM || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\([^)]*\)/g, '')
        .replace(/[0-9.]/g, '')
        .split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length) {
        const label = String(row.MMEAL_SC_NM || '급식').trim();
        let text = lines.join(', ');
        if (text.length > 110) text = text.slice(0, 108) + '…';
        body += `\n${label}: ${text}`;
      }
    }
  }

  return {
    title: `오늘의 시간표 · ${prefs.grade}학년 ${prefs.cls}반${off ? ' (쉬는 날)' : ''}`,
    body,
    tag: 'meonji-daily',
    url: '/'
  };
}

/* 하나 전송. 만료된 구독(404/410)은 삭제하고 'gone' 을 돌려줍니다. */
async function sendOne(redis, id, record, message) {
  try {
    await webpush.sendNotification(record.sub, JSON.stringify(message), { TTL: 3600, urgency: 'normal' });
    return 'sent';
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) {
      await redis.del(subKey(id));
      await redis.srem('push:subs', id);
      return 'gone';
    }
    console.error('push 전송 실패:', e && (e.statusCode || e.message));
    return 'failed';
  }
}

module.exports = {
  getRedis, initWebPush, subId, subKey, sanitizePrefs, validSubscription,
  kstNow, buildDailyMessage, sendOne
};

// api/get-data.js
const fetch = require('node-fetch'); // Vercel 기본 탑재 또는 하단 대안 적용용

module.exports = async function (req, res) {
    // 1. 브라우저에서 안전하게 접근할 수 있도록 CORS 헤더 허용
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2. Vercel 환경 변수에서 안전하게 키를 가져옵니다.
    // ⚠️ Vercel 대시보드에 등록하신 이름이 'MY_NEIS_KEY'여야 합니다!
    const NEIS_KEY = process.env.MY_NEIS_KEY;

    // 3. 브라우저(HTML)가 보낸 요청 파라미터들을 가져옵니다.
    const { urlPath, ...queryParams } = req.query;

    if (!urlPath) {
        return res.status(400).json({ error: "urlPath 파라미터가 누락되었습니다." });
    }

    // 4. 나이스 오픈 API로 보낼 진짜 주소 조립
    const searchParams = new URLSearchParams({
        KEY: NEIS_KEY,
        ...queryParams
    }).toString();

    const finalUrl = `https://open.neis.go.kr/hub/${urlPath}?${searchParams}`;

    try {
        // 최신 Vercel Node.js 환경에서는 글로벌 fetch를 지원하므로 바로 사용 가능합니다.
        const response = await fetch(finalUrl);
        const data = await response.json();
        
        // 브라우저에게 최종 데이터 전달
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
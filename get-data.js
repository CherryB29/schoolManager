// api/get-data.js (Vercel Serverless Function)
export default async function handler(req, res) {
    const headers = {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Credentials', headers['Access-Control-Allow-Credentials']);
        res.setHeader('Access-Control-Allow-Origin', headers['Access-Control-Allow-Origin']);
        res.setHeader('Access-Control-Allow-Methods', headers['Access-Control-Allow-Methods']);
        res.status(200).send('');
        return;
    }

    const NEIS_KEY = process.env.MY_NEIS_KEY;
    if (!NEIS_KEY) {
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({ error: 'MY_NEIS_KEY 환경변수가 설정되어 있지 않습니다.' });
        return;
    }

    const query = req.query || {};
    const { urlPath, ...queryParams } = query;
    if (!urlPath) {
        res.status(400).json({ error: 'urlPath 쿼리 파라미터가 필요합니다.' });
        return;
    }

    const searchParams = new URLSearchParams({ KEY: NEIS_KEY, ...queryParams }).toString();
    const finalUrl = `https://open.neis.go.kr/hub/${urlPath}?${searchParams}`;

    try {
        const response = await fetch(finalUrl);
        const data = await response.json();
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

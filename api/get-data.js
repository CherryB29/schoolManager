// api/get-data.js (Netlify Function)
const fetch = globalThis.fetch;

exports.handler = async function (event, context) {
    const headers = {
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const NEIS_KEY = process.env.MY_NEIS_KEY;
    if (!NEIS_KEY) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'MY_NEIS_KEY 환경변수가 설정되어 있지 않습니다.' }) };
    }

    const query = event.queryStringParameters || {};
    const { urlPath, ...queryParams } = query;
    if (!urlPath) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'urlPath 쿼리 파라미터가 필요합니다.' }) };
    }

    const searchParams = new URLSearchParams({ KEY: NEIS_KEY, ...queryParams }).toString();
    const finalUrl = `https://open.neis.go.kr/hub/${urlPath}?${searchParams}`;

    try {
        const response = await fetch(finalUrl);
        const data = await response.json();
        return { statusCode: 200, headers, body: JSON.stringify(data) };
    } catch (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
};

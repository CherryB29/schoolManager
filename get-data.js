// api/get-data.js
const fetch = globalThis.fetch;

module.exports = async function (req, res) {
    // 1. 釉뚮씪?곗??먯꽌 ?덉쟾?섍쾶 ?묎렐?????덈룄濡?CORS ?ㅻ뜑 ?덉슜
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 2. Vercel 같은 서버리스 환경에서 환경변수로 NEIS 키를 숨깁니다.
    // 클라이언트에는 API KEY가 절대 남지 않습니다.
    const NEIS_KEY = process.env.MY_NEIS_KEY;

    if (!NEIS_KEY) {
        return res.status(500).json({ error: '?쒕쾭??MY_NEIS_KEY ?섍꼍 蹂?섍? ?ㅼ젙?섏뼱 ?덉? ?딆뒿?덈떎.' });
    }

    // 3. 釉뚮씪?곗?(HTML)媛 蹂대궦 ?붿껌 ?뚮씪誘명꽣?ㅼ쓣 媛?몄샃?덈떎.
    const { urlPath, ...queryParams } = req.query;

    if (!urlPath) {
        return res.status(400).json({ error: "urlPath ?뚮씪誘명꽣媛 ?꾨씫?섏뿀?듬땲??" });
    }

    // 4. ?섏씠???ㅽ뵂 API濡?蹂대궪 吏꾩쭨 二쇱냼 議곕┰
    const searchParams = new URLSearchParams({
        KEY: NEIS_KEY,
        ...queryParams
    }).toString();

    const finalUrl = `https://open.neis.go.kr/hub/${urlPath}?${searchParams}`;

    try {
        // 理쒖떊 Vercel Node.js ?섍꼍?먯꽌??湲濡쒕쾶 fetch瑜?吏?먰븯誘濡?諛붾줈 ?ъ슜 媛?ν빀?덈떎.
        const response = await fetch(finalUrl);
        const data = await response.json();
        
        // 釉뚮씪?곗??먭쾶 理쒖쥌 ?곗씠???꾨떖
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

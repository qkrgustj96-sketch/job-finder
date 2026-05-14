/**
 * Vercel Edge Function — 한국 채용 사이트 CORS 프록시
 *
 * Railway(미국 IP)가 아닌 Vercel 글로벌 엣지에서 페이지를 가져와
 * 브라우저에 CORS 헤더와 함께 전달.
 *
 * 엔드포인트: GET /api/proxy?url=<인코딩된URL>
 */
export const config = { runtime: 'edge' };

const ALLOWED_DOMAINS = [
  'saramin.co.kr',
  'jobkorea.co.kr',
  'incruit.com',
  'wanted.co.kr',
  'jumpit.co.kr',
  'rallit.com',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const { searchParams } = new URL(req.url);
  const url = searchParams.get('url');

  if (!url || !ALLOWED_DOMAINS.some(d => url.includes(d))) {
    return new Response(JSON.stringify({ error: 'URL not allowed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const controller = new AbortController();
  // Edge Function 타임아웃 여유분 고려 (Vercel Edge: 30s 제한)
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const origin = new URL(url).origin;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        Referer: origin + '/',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    clearTimeout(timer);

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `upstream ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const html = await response.text();
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS },
    });
  } catch (e) {
    clearTimeout(timer);
    return new Response(JSON.stringify({ error: e.message || 'fetch failed' }), {
      status: 504,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }
}

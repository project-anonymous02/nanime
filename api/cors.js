// api/cors.js · Vercel Edge Function
export const config = { runtime: 'edge' };

export default async function handler(req) {
    try {
        const { searchParams } = new URL(req.url);
        const target = searchParams.get('url');
        if (!target) return new Response('?url= required', { status: 400 });

        // HANYA izinkan domain CDN video yang dikenal — security
        const allowed = /(gogoanime|vidstream|goload|streamwish|doodcdn|anime|m3u8|mp4)/i;
        if (!allowed.test(target)) return new Response('Domain not allowed', { status: 403 });

        const headers = new Headers(req.headers);
        headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36');
        headers.set('Referer', 'https://gogoanime3.co/');
        headers.set('Origin', 'https://gogoanime3.co');
        headers.delete('cookie');
        headers.delete('authorization');

        const up = new Request(target, {
            method: req.method,
            headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
            redirect: 'follow'
        });

        const res = await fetch(up);
        const out = new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                'Access-Control-Expose-Headers': 'Content-Length, Content-Type',
                'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
                'Cache-Control': 'public, max-age=14400, s-maxage=14400',
                'Vary': 'Accept-Encoding'
            }
        });
        return out;
    } catch (e) {
        return new Response('CORS proxy error: ' + e.message, { status: 502, headers: { 'Access-Control-Allow-Origin':'*' } });
    }
}

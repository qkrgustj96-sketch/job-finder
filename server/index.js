import express from 'express';
import cors from 'cors';
import { scrapeWanted } from './scrapers/wanted.js';
import { scrapeSaramin } from './scrapers/saramin.js';
import { scrapeJobkorea } from './scrapers/jobkorea.js';
import { scrapeIncruit } from './scrapers/incruit.js';
import { parseJobDetail } from './scrapers/jobDetail.js';

const SCRAPERS = { wanted: scrapeWanted, saramin: scrapeSaramin, jobkorea: scrapeJobkorea, incruit: scrapeIncruit };

const app = express();
app.use(cors({ origin: '*' }));  // 배포 후 Vercel 도메인 등 모든 출처 허용

// SSE 스트리밍 엔드포인트 - 각 사이트의 페이지별 결과를 실시간 전달
app.get('/api/jobs/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  const send = (data) => {
    if (!closed) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const { keyword, sites = 'wanted,saramin,jobkorea,incruit', ...filters } = req.query;

  if (!keyword) {
    send({ type: 'error', message: 'keyword required' });
    res.end();
    return;
  }

  const siteList = sites.split(',').filter(s => SCRAPERS[s]);

  await Promise.all(siteList.map(async (site) => {
    try {
      let siteRank = 1; // 사이트 내 노출 순서 (API 반환 순 = 사이트 자체 인기/최신순)
      for await (const jobs of SCRAPERS[site](keyword, filters)) {
        if (closed) break;
        const ranked = jobs.map((j, i) => ({ ...j, siteRank: siteRank + i }));
        siteRank += jobs.length;
        send({ type: 'jobs', site, jobs: ranked });
      }
      send({ type: 'done', site });
    } catch (e) {
      console.error(`[${site}] 실패:`, e.message);
      send({ type: 'error', site, message: e.message });
    }
  }));

  if (!closed) {
    send({ type: 'complete' });
    res.end();
  }
});

// 공고 URL 파싱 엔드포인트
app.get('/api/job/parse', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.json({ ok: false, error: 'url 파라미터 필요' });
  try {
    const detail = await parseJobDetail(url);
    res.json({ ok: true, ...detail });
  } catch (e) {
    console.error('[parse]', e.message);
    res.json({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, '0.0.0.0', () => console.log(`서버 실행 중: http://localhost:${PORT}`));

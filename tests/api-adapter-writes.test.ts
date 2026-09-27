import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiAdapter } from '../apps/web/src/adapters/web/apiAdapter.js';

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('API Adapter·写操作完全走 Local API', () => {
  it('创建参考素材提交 source.register，不回落演示适配器', async () => {
    let detailCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/commands')) return json({ project_id: 'p1', revision: 2 });
      detailCalls += 1;
      return json({
        id: 'p1', name: '项目', revision: detailCalls === 1 ? 1 : 2, state: 'INGESTED',
        max_budget_cents: 0, rights_confirmed: true, deleted_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        shot_fields: null,
        sources: detailCalls === 1 ? [] : [{ asset_id: 'a1', relative_path: 'references/reference.mp4', bytes: 1024, media_type: 'video/mp4' }],
        image_generations: [], video_generations: [], derived_artifacts: [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createApiAdapter();
    await adapter.source.create('p1', '参考片', '知识类口播');

    const commands = fetchMock.mock.calls
      .filter(call => String(call[0]).endsWith('/commands'))
      .map(call => JSON.parse(String(call[1]?.body ?? '{}')) as { type: string });
    expect(commands).toEqual([expect.objectContaining({ type: 'source.register' })]);
  });

  it('创建生成任务提交 image-generation.request，并返回 Local API 队列记录', async () => {
    let detailCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/commands')) return json({ project_id: 'p1', revision: 2 });
      detailCalls += 1;
      return json({
        id: 'p1', name: '项目', revision: detailCalls === 1 ? 1 : 2, state: 'PRODUCTION',
        max_budget_cents: 1000, rights_confirmed: true, deleted_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        shot_fields: { shots: [{ shot_id: 'shot-01' }] },
        sources: [], derived_artifacts: [],
        image_generations: detailCalls === 1 ? [] : [{
          intent_id: 'intent-1', shot_id: 'shot-01', model: 'local-demo', prompt: '候选首帧',
          status: 'ADMITTED', created_at: '2026-01-01T00:00:00Z',
        }],
        video_generations: [],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = createApiAdapter();
    const job = await adapter.generation.create('p1', '候选首帧', '图像生成');
    expect(job).toMatchObject({ title: '候选首帧', status: 'running' });

    const commands = fetchMock.mock.calls
      .filter(call => String(call[0]).endsWith('/commands'))
      .map(call => JSON.parse(String(call[1]?.body ?? '{}')) as { type: string });
    expect(commands).toEqual([expect.objectContaining({ type: 'image-generation.request' })]);
  });
});

import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../apps/web/src/adapters/web/memoryAdapter.js';

describe('项目管理端口', () => {
  it('支持创建、改名、归档、恢复、复制与彻底删除', async () => {
    const created = await memoryAdapter.projects.create({
      name: '测试项目',
      description: '项目管理验证',
      rightsConfirmed: true,
      maxBudgetCents: 1000,
    });
    expect(created).toMatchObject({ name: '测试项目', rightsConfirmed: true, maxBudgetCents: 1000 });

    const renamed = await memoryAdapter.projects.rename(created.id, '测试项目 · 已改名');
    expect(renamed.name).toBe('测试项目 · 已改名');

    const trashed = await memoryAdapter.projects.trash(created.id);
    expect(trashed.status).toBe('archived');
    await expect(memoryAdapter.projects.listArchived()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));

    const restored = await memoryAdapter.projects.restore(created.id);
    expect(restored.status).toBe('active');

    const copy = await memoryAdapter.projects.duplicate(created.id);
    expect(copy.name).toContain('副本');
    await memoryAdapter.projects.purge(copy.id, copy.name);
    await memoryAdapter.projects.purge(created.id, renamed.name);

    const remaining = await memoryAdapter.projects.list();
    expect(remaining.some(project => project.id === created.id || project.id === copy.id)).toBe(false);
  });
});

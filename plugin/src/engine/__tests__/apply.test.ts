import { describe, expect, it } from 'vitest';
import { applyPlan } from '../apply';
import type { ApplyPlan } from '../apply';
import { EchoGuard } from '../echo';
import { FakeGateway } from './fake-vault';

function write(path: string, data: string | ArrayBuffer = 'текст'): ApplyPlan['writes'][number] {
  return { path, data, mtime: 4242, ctime: 111 };
}

describe('применение операций к хранилищу', () => {
  it('переезд: файл появляется по новому пути раньше, чем исчезает по старому', async () => {
    const gateway = new FakeGateway();
    gateway.files.set('a.md', 'текст');
    await applyPlan(gateway, { writes: [write('sub/b.md')], trashes: ['a.md'] });
    expect(gateway.events.map((e) => `${e.kind} ${e.path}`)).toEqual([
      'createFolder sub',
      'create sub/b.md',
      'trash a.md',
    ]);
    expect(gateway.files.has('a.md')).toBe(false);
  });

  it('все создания и обновления идут раньше всех удалений', async () => {
    const gateway = new FakeGateway();
    gateway.files.set('old1.md', 'x');
    gateway.files.set('old2.md', 'x');
    const report = await applyPlan(gateway, {
      writes: [write('new1.md'), write('new2.md')],
      trashes: ['old1.md', 'old2.md'],
    });
    expect(gateway.events.map((e) => e.kind)).toEqual(['create', 'create', 'trash', 'trash']);
    expect(report.written).toEqual(['new1.md', 'new2.md']);
    expect(report.trashed).toEqual(['old1.md', 'old2.md']);
  });

  it('mtime и ctime берутся из метаданных, а не из момента записи', async () => {
    const gateway = new FakeGateway();
    await applyPlan(gateway, { writes: [write('a.md')], trashes: [] });
    expect(gateway.stats.get('a.md')).toEqual({ mtime: 4242, ctime: 111 });
  });

  it('существующий файл обновляется, а не создаётся заново', async () => {
    const gateway = new FakeGateway();
    gateway.files.set('a.md', 'старое');
    await applyPlan(gateway, { writes: [write('a.md', 'новое')], trashes: [] });
    expect(gateway.events).toEqual([{ kind: 'modify', path: 'a.md' }]);
    expect(gateway.files.get('a.md')).toBe('новое');
  });

  it('бинарное содержимое пишется бинарными методами', async () => {
    const gateway = new FakeGateway();
    const data = new ArrayBuffer(4);
    await applyPlan(gateway, { writes: [write('img.png', data)], trashes: [] });
    await applyPlan(gateway, { writes: [write('img.png', data)], trashes: [] });
    expect(gateway.events.map((e) => e.kind)).toEqual(['createBinary', 'modifyBinary']);
  });

  it('недостающие папки создаются сверху вниз и по одному разу', async () => {
    const gateway = new FakeGateway();
    await applyPlan(gateway, {
      writes: [write('a/b/c.md'), write('a/b/d.md')],
      trashes: [],
    });
    expect(gateway.events.filter((e) => e.kind === 'createFolder').map((e) => e.path)).toEqual([
      'a',
      'a/b',
    ]);
  });

  it('пропавший файл в списке удаления не считается ошибкой', async () => {
    const report = await applyPlan(new FakeGateway(), { writes: [], trashes: ['ghost.md'] });
    expect(report.missing).toEqual(['ghost.md']);
    expect(report.failed).toEqual([]);
  });

  it('сбой одной записи не отменяет остальные', async () => {
    const gateway = new FakeGateway();
    gateway.failOn = 'bad.md';
    const report = await applyPlan(gateway, {
      writes: [write('bad.md'), write('good.md')],
      trashes: [],
    });
    expect(report.written).toEqual(['good.md']);
    expect(report.failed).toEqual([{ path: 'bad.md', message: 'запись запрещена: bad.md' }]);
  });

  it('на время записи путь помечен как применяемый: отправки не будет', async () => {
    const gateway = new FakeGateway();
    const echo = new EchoGuard();
    const marks: boolean[] = [];
    const original = gateway.create.bind(gateway);
    gateway.create = async (path, data, options) => {
      marks.push(echo.isApplying(path));
      await original(path, data, options);
    };
    await applyPlan(gateway, { writes: [write('a.md')], trashes: [] }, { echo });
    expect(marks).toEqual([true]);
    expect(echo.isApplying('a.md')).toBe(false);
  });
});

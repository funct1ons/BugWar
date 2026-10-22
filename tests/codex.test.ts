import { describe, expect, it } from 'vitest';
import { RACES, type RaceId, type Road } from '../src/core/types';
import { BATTLE_RULES } from '../src/core/rules';
import { LEVELS } from '../src/data/levels';
import {
  BUILDING_CODEX_ENTRIES,
  CODEX_ENTRIES,
  CODEX_TABS,
  COMMAND_CODEX_ENTRIES,
  RACE_CODEX_ENTRIES,
  codexEntryById,
  escapeHtml,
  escapeIntent,
  normalizeCodexState,
  pauseKeyIntent,
  renderCodex,
  renderMinimapRoads,
} from '../src/data/codex';

/** Mirrors the display formatter used by the codex renderer. */
const shown = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

describe('codex data uses the shared battle numbers', () => {
  it('lists four races and four buildings with no locked entry hidden', () => {
    expect(CODEX_TABS.map((tab) => tab.id)).toEqual(['races', 'buildings', 'command']);
    expect(RACE_CODEX_ENTRIES).toHaveLength(4);
    expect(BUILDING_CODEX_ENTRIES).toHaveLength(4);
    expect(COMMAND_CODEX_ENTRIES).toHaveLength(4);
    expect(Object.values(CODEX_ENTRIES).flat().map((entry) => entry.id)).toEqual([
      'race-agile',
      'race-fast',
      'race-strong',
      'race-brood',
      'building-nest',
      'building-hatchery',
      'building-wind',
      'building-cannon',
      'command-roads',
      'command-storm',
      'command-ownership',
      'command-controls',
    ]);
  });

  it.each(['agile', 'fast', 'strong', 'brood'] as RaceId[])('renders %s from RACES without drift', (race) => {
    const entry = RACE_CODEX_ENTRIES.find((candidate) => candidate.race === race)!;
    const source = RACES[race];
    expect({ speed: entry.speed, attack: entry.attack, defense: entry.defense, production: entry.production })
      .toEqual({ speed: source.speed, attack: source.attack, defense: source.defense, production: source.production });
    expect(entry.perSecond).toBe(source.production * BATTLE_RULES.nestProduction);

    const html = renderCodex({ tab: 'races', entryId: entry.id, raceUnlocked: { agile: true, fast: false, strong: false, brood: false } });
    expect(html).toContain(`data-codex-detail="${entry.id}"`);
    expect(html).toContain(`>${shown(source.speed)}</strong>`);
    expect(html).toContain(`>×${source.attack.toFixed(2)}</strong>`);
    expect(html).toContain(`>×${source.defense.toFixed(2)}</strong>`);
    expect(html).toContain(`>×${source.production.toFixed(2)}</strong>`);
    expect(html).toContain(`${shown(entry.perSecond)} 兵/秒`);
    expect(html).toContain('没有石头剪刀布式克制');
    expect(html).toContain('解锁条件');
    // Locked races remain real, full entries: never disabled and never hidden.
    expect(html).toContain('data-value="race-fast"');
    if (entry.race !== 'agile') expect(html).toContain('未解锁 · 仍可学习');
    expect(html).not.toMatch(/data-action="codex-entry"[^>]*disabled/);
  });

  it('does not hardcode race prose or turret notes away from RACES/BATTLE_RULES', () => {
    const agile = RACE_CODEX_ENTRIES.find((entry) => entry.race === 'agile')!;
    const fast = RACE_CODEX_ENTRIES.find((entry) => entry.race === 'fast')!;
    const strong = RACE_CODEX_ENTRIES.find((entry) => entry.race === 'strong')!;
    expect(agile.strengths[0]).toContain(`速度 ${shown(RACES.agile.speed)}`);
    expect(agile.strengths[0]).toContain(`攻击 ×${RACES.agile.attack.toFixed(2)}`);
    expect(fast.strengths[0]).toContain(`行军速度 ${shown(RACES.fast.speed)}`);
    expect(strong.weaknesses[0]).toContain(`行军速度 ${shown(RACES.strong.speed)}`);
    expect(agile.strengths[1]).not.toContain('容错最高');

    const cannon = BUILDING_CODEX_ENTRIES.find((entry) => entry.building === 'cannon')!;
    expect(cannon.stats.find((stat) => stat.label === '单发伤害')!.note)
      .toContain(`${shown(BATTLE_RULES.cannonDamage)} 只`);
  });
});

describe('codex buildings and rules reflect live mechanics', () => {
  it('renders nest production and cannon values from BATTLE_RULES', () => {
    const nest = renderCodex({ tab: 'buildings', entryId: 'building-nest' });
    expect(nest).toContain(`${shown(BATTLE_RULES.nestProduction)} 兵/秒`);
    expect(nest).toContain('关卡可用 production 字段覆盖');
    expect(nest).toContain(`${BATTLE_RULES.productionCap} 兵`);
    expect(nest).toContain('没有隐藏升级');
    expect(nest).toContain('没有建筑升级、人口建筑、科技树或特殊弹药');

    const cannon = renderCodex({ tab: 'buildings', entryId: 'building-cannon' });
    expect(cannon).toContain(`>${shown(BATTLE_RULES.cannonRange)}</strong>`);
    expect(cannon).toContain(`>${shown(BATTLE_RULES.cannonDamage)}</strong>`);
    expect(cannon).toContain(`>${shown(BATTLE_RULES.cannonCooldown)} 秒</strong>`);
    expect(cannon).toContain('不会攻击建筑驻军');
    expect(cannon).toContain('0 兵/秒');
  });

  it('shows the selected battle nest actual production, including map overrides', () => {
    const html = renderCodex({
      tab: 'buildings',
      entryId: 'building-nest',
      inBattle: true,
      selectedColonies: [
        { id: 'b', owner: 1, kind: 'nest', units: 42, production: 2.5, race: 'fast' },
        { id: 'd', owner: 0, kind: 'nest', units: 9, production: 2, race: undefined },
      ],
    });
    const blueRate = 2.5 * RACES.fast.production;
    expect(html).toContain('战场实测 · 已选生产建筑');
    expect(html).toContain(`${shown(blueRate)} 兵/秒`);
    expect(html).toContain('2.5 地图倍率');
    expect(html).toContain('中立不生产');
  });

  it('omits live production outside battle and explains when nothing is selected', () => {
    expect(renderCodex({ tab: 'buildings', entryId: 'building-nest' })).not.toContain('战场实测');
    expect(renderCodex({ tab: 'buildings', entryId: 'building-nest', inBattle: true, selectedColonies: [] }))
      .toContain('打开图鉴前选中生产建筑');
  });

  it('renders road, storm, ownership and control rules with real values', () => {
    const roads = renderCodex({ tab: 'command', entryId: 'command-roads' });
    expect(roads).toContain('能沿你控制的建筑连通目标的所选己方建筑');
    expect(roads).toContain('只有己方建筑可中转');
    expect(roads).toContain('经过己方建筑自动继续下一段');
    expect(roads).toContain('最短几何路线');
    expect(roads).toContain('无可用路径');
    expect(roads).toContain('道路遭遇');
    expect(roads).toContain('不是连线经济');

    const storm = renderCodex({ tab: 'command', entryId: 'command-storm' });
    expect(storm).toContain(`能量达到 ${shown(BATTLE_RULES.skillCost)}%`);
    expect(storm).toContain(`半径 ${shown(BATTLE_RULES.skillRadius)}`);
    expect(storm).toContain(`最多损失 ${shown(BATTLE_RULES.skillDamage)} 兵`);
    expect(storm).toContain(`${shown(BATTLE_RULES.energyRate)}% / 秒`);
    expect(storm).toContain('不改变归属');

    const ownership = renderCodex({ tab: 'command', entryId: 'command-ownership' });
    expect(ownership).toContain('攻方兵力 × 攻击 &gt; 守方驻军 × 防御');
    expect(ownership).toContain('敌方建筑与在途部队全部清空即胜');
    expect(ownership).toContain('蓝方占领它即胜利');
    expect(ownership).toContain('中立建筑不是默认胜利目标');
    expect(ownership).toContain('在途军队');

    const controls = renderCodex({ tab: 'command', entryId: 'command-controls' });
    expect(controls).toContain('Shift 追加');
    expect(controls).toContain('C 打开图鉴');
    expect(controls).toContain('恢复打开前的暂停状态');
  });
});

describe('codex state and markup', () => {
  it('normalizes invalid categories and entries to a visible first entry', () => {
    expect(normalizeCodexState('missing', 'missing')).toEqual({ tab: 'races', entryId: 'race-agile' });
    expect(normalizeCodexState('buildings', 'race-fast')).toEqual({ tab: 'buildings', entryId: 'building-nest' });
    expect(normalizeCodexState('command', 'command-storm')).toEqual({ tab: 'command', entryId: 'command-storm' });
  });

  it('renders one active tab/entry, all category items, and accessible tab wiring', () => {
    const html = renderCodex({
      tab: 'races',
      entryId: 'race-fast',
      artBase: './',
      raceUnlocked: { agile: true, fast: false, strong: false },
      currentRace: 'agile',
    });
    expect(html).toContain('data-codex-tab="races"');
    expect(html).toContain('data-codex-detail="race-fast"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html.match(/data-action="codex-tab"/g)).toHaveLength(3);
    expect(html.match(/data-action="codex-entry"/g)).toHaveLength(4);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toContain('data-value="race-fast"');
    expect(html).toContain('未解锁 · 仍可学习');
    expect(html).toContain('当前战役种族');
    expect(html).toContain('class="codex-bug-window"');
    expect(html).toContain('class="codex-bug-sheet"');
    expect(html).toContain('src="./art/bug-fast.svg"');
    expect(html).not.toMatch(/data-action="codex-entry"[^>]*disabled/);
  });

  it('renders only the selected category list while keeping detail title clear', () => {
    const buildings = renderCodex({ tab: 'buildings', entryId: 'building-cannon' });
    expect(buildings.match(/data-action="codex-entry"/g)).toHaveLength(4);
    expect(buildings).toContain('data-value="building-cannon"');
    expect(buildings).not.toContain('data-value="race-agile"');
    expect(buildings).toContain('<h3>守望炮塔');
    expect(buildings).toContain('class="codex-building-art"');
    expect(buildings).toContain('src="art/cannon.svg"');
  });

  it('escapes dynamic text and still exposes the real data', () => {
    expect(escapeHtml('<b>&"\'</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
    expect(codexEntryById('building-nest')?.kind).toBe('building');
    expect(codexEntryById('nope')).toBeUndefined();
  });
});

describe('modal keyboard semantics', () => {
  it('toggles pause on both P presses without relaxing modal rules', () => {
    expect(pauseKeyIntent('battle', '')).toBe('toggle');
    expect(pauseKeyIntent('battle', 'pause')).toBe('toggle');
    expect(pauseKeyIntent('battle', 'codex')).toBe('none');
    expect(pauseKeyIntent('battle', 'codex', true)).toBe('none');
    expect(pauseKeyIntent('battle', 'settings')).toBe('none');
    expect(pauseKeyIntent('menu', '')).toBe('none');
    expect(pauseKeyIntent('campaign', '')).toBe('none');
    expect(pauseKeyIntent('result', '')).toBe('none');
  });

  it('ignores auto-repeated P in both live and paused states', () => {
    expect(pauseKeyIntent('battle', '', false)).toBe('toggle');
    expect(pauseKeyIntent('battle', '', true)).toBe('none');
    expect(pauseKeyIntent('battle', 'pause', false)).toBe('toggle');
    expect(pauseKeyIntent('battle', 'pause', true)).toBe('none');
  });

  it('gives Esc modal priority, then aim/selection/pause semantics', () => {
    expect(escapeIntent('battle', 'codex', false, true)).toBe('close-modal');
    expect(escapeIntent('battle', 'pause', false, false)).toBe('close-modal');
    expect(escapeIntent('menu', 'codex', false, false)).toBe('close-modal');
    expect(escapeIntent('battle', '', true, true)).toBe('scene-cancel-skill');
    expect(escapeIntent('battle', '', false, true)).toBe('clear-selection');
    expect(escapeIntent('battle', '', false, false)).toBe('pause');
    expect(escapeIntent('menu', '', false, false)).toBe('none');
    expect(escapeIntent('campaign', '', false, false)).toBe('none');
  });
});

describe('minimap roads', () => {
  const colonies = [
    { id: 'a', x: 100, y: 200 },
    { id: 'b', x: 300, y: 400 },
    { id: 'c', x: 500, y: 100 },
  ];

  it('draws only real Road[] edges instead of colony array order', () => {
    const roads: Road[] = [['a', 'c']];
    const html = renderMinimapRoads(colonies, roads);
    expect(html.match(/class="minimap-road"/g)).toHaveLength(1);
    expect(html).toContain('data-road="a-c"');
    expect(html).toContain('x1="100" y1="100" x2="500" y2="0"');
    expect(html).not.toContain('data-road="a-b"');
    expect(html).not.toContain('data-road="b-c"');
  });

  it('skips malformed endpoints and self-pairs without inventing an edge', () => {
    const roads: Road[] = [['a', 'a'], ['a', 'missing'], ['b', 'c']];
    const html = renderMinimapRoads(colonies, roads);
    expect(html.match(/data-road=/g)).toHaveLength(1);
    expect(html).toContain('data-road="b-c"');
  });

  it('renders every configured road on all 18 campaign minimaps', () => {
    for (const level of LEVELS) {
      const html = renderMinimapRoads(level.colonies, level.roads);
      expect(html.match(/data-road=/g)?.length ?? 0).toBe(level.roads.length);
      for (const [from, to] of level.roads) expect(html).toContain(`data-road="${from}-${to}"`);
    }
  });
});

import Phaser from 'phaser';
import { BattleScene } from './game/BattleScene';
import { AudioSystem } from './audio/AudioSystem';
import { MusicDirector } from './audio/MusicDirector';
import { LEVELS, BIOMES } from './data/levels';
import { ACHIEVEMENTS, SaveSystem } from './storage/SaveSystem';
import { rateVictory } from './core/Simulation';
import { formatUnits } from './ui/format';
import type { RaceId } from './core/types';
import { ACTS, BRIEFINGS, LORE_NOTICE, actForLevel } from './data/lore';
import './style.css';

const base = import.meta.env.BASE_URL;

/** 固定阵营调色：中立、己方蓝、敌2红、敌3紫、敌4金。DOM 迷你地图共用。 */
const FACTION_COLORS = ['#92A18B', '#327FC1', '#C85F48', '#8B70BA', '#C49336'];

const stars = (n: number) => `<span class="stars">${'★'.repeat(n)}<span class="dim">${'★'.repeat(5 - n)}</span></span>`;
const clock = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${Math.floor(n % 60).toString().padStart(2, '0')}`;
const pad = (n: number) => String(n).padStart(2, '0');
const raceName = { agile: '敏捷族', fast: '疾行族', strong: '重甲族' };
const raceText = { agile: '均衡的先锋 · 灵活扩张', fast: '更快的行军 · 轻甲突袭', strong: '强韧的甲壳 · 缓慢而有力' };

/** 封面同款叶片标记，用于主按钮；不引入新素材依赖。 */
const LEAF_ICON = `<span class="leaf-mark" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M20.5 3.5C9.5 3.5 3.5 9.5 3.5 20.5 14.5 20.5 20.5 14.5 20.5 3.5Z" fill="currentColor"/><path d="M18.2 5.8 7 17" fill="none" stroke="#fffdf7" stroke-width="1.3" stroke-linecap="round" opacity=".8"/></svg></span>`;

class Application {
  save = new SaveSystem();
  audio = new AudioSystem(this.save.data.settings);
  music = new MusicDirector(this.audio);
  scene = new BattleScene();
  screen: 'menu' | 'campaign' | 'battle' | 'result' = 'menu';
  race: RaceId = 'agile';
  levelIndex = 0;
  modal = '';
  lastHUD = 0;
  toastTimer = 0;
  wasPaused = false;
  ui = document.getElementById('ui')!;

  constructor() {
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game',
      width: 1600,
      height: 900,
      backgroundColor: '#EAF2D6',
      antialias: true,
      powerPreference: 'high-performance',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: this.scene,
      render: { roundPixels: false },
      audio: { noAudio: true },
    });

    const resize = () => {
      this.ui.style.transform = `translate(-50%,-50%) scale(${Math.min(innerWidth / 1600, innerHeight / 900)})`;
    };
    resize();
    window.addEventListener('resize', resize);

    this.scene.onTick = () => {
      if (this.screen === 'battle' && this.scene.sim) this.music.update(this.scene.sim.world, this.scene.paused);
      this.updateHUD();
    };
    this.scene.onAction = (n: string) => this.feedback(n);
    this.scene.onEnd = (s: string) => this.end(s);

    this.ui.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (button && !button.hasAttribute('disabled')) {
        void this.audio.unlock();
        this.audio.play('click');
        this.action(button.dataset.action!, button.dataset.value);
      }
    });
    this.ui.addEventListener('pointerover', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.audio.play('hover');
    });

    document.addEventListener('pointerdown', () => {
      void this.audio.unlock();
    }, { once: true });

    document.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).matches('input,select')) return;
      if (e.code === 'Escape' && this.screen === 'battle' && (!this.scene.skillArmed || !!this.modal)) {
        e.preventDefault();
        e.stopPropagation();
        if (this.modal) this.closeModal();
        else if (this.scene.selected.size) this.scene.selected.clear();
        else this.pause();
      } else if (e.code === 'KeyP' && this.screen === 'battle') {
        e.preventDefault();
        this.pause();
      } else if (e.code === 'KeyM') {
        this.save.data.settings.muted = !this.save.data.settings.muted;
        this.audio.configure(this.save.data.settings);
        this.save.persist();
        this.toast(this.save.data.settings.muted ? '声音已静音' : '声音已开启');
      }
    }, true);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.screen === 'battle' && !this.scene.paused) this.pause();
    });

    this.renderMenu();
    if (new URLSearchParams(location.search).has('test')) {
      (window as unknown as { __BUGWAR__: Application }).__BUGWAR__ = this;
    }
  }

  private header(label: string) {
    return `<header class="topbar">
      <button class="brand" data-action="menu"><img src="${base}art/emblem.svg" alt=""><span>翡翠王冠<small>虫界战争 · 日光花园</small></span></button>
      <nav class="top-nav">
        <button class="top-link" data-action="lore">雨后纪事</button>
        <span class="top-label">${label}</span>
      </nav>
      <div class="top-actions">
        <button class="icon-button" data-action="help" aria-label="玩法指南">?</button>
        <button class="icon-button" data-action="settings" aria-label="游戏设置">⚙</button>
      </div>
    </header>`;
  }

  renderMenu() {
    this.hideToast();
    this.screen = 'menu';
    this.modal = '';
    if (this.scene.ready) this.scene.showMenu();
    this.music.menu();
    const done = Object.keys(this.save.data.results.agile).length;
    const totalStars = this.save.stars('agile');
    this.ui.innerHTML = `<section class="menu-screen">
      <img class="menu-cover" src="${base}art/cover.svg" width="1600" height="900" alt="雨后方寸花园里，持叶刃的蓝方前锋与持斧的红方守卫交锋">
      ${this.header('日光花园 · 十三巢远征')}
      <div class="hero-copy">
        <span class="menu-badge"><i></i>雨后初晴 · 十三巢远征</span>
        <h1>翡翠王冠</h1>
        <p class="hero-subtitle">方寸花园，亦有英雄。</p>
        <p class="hero-description">率领虫群夺回巢域，<br>让每一条归途重新亮起。</p>
        <div class="hero-buttons">
          <button class="button primary large" data-action="campaign">${LEAF_ICON}${done ? '继续远征' : '点亮第一盏巢灯'}<b>→</b></button>
          <button class="button secondary" data-action="campaign">选择关卡</button>
          <button class="button secondary" data-action="help">操作指南</button>
        </div>
        <div class="menu-progress">
          <div class="menu-progress-top"><span class="tiny">归途正在延伸</span><span class="menu-stars">${totalStars} / 65 ★</span></div>
          <div class="menu-progress-count"><b>${pad(done)}</b><span>/ 13<small>处巢域已完成</small></span></div>
          <div class="progress-track"><span style="width:${done / 13 * 100}%"></span></div>
        </div>
      </div>
      <footer class="menu-footer">
        <span class="menu-facts">13 处巢域 · 3 支虫族 · 单人策略远征</span>
        <button data-action="achievements">♜ 成就 <b>${this.save.data.achievements.length}/12</b></button>
        <button data-action="credits">制作与溯源 ↗</button>
        <span class="version">日光花园 / ${this.save.available ? '本机存档' : '仅本次会话'}</span>
      </footer>
    </section>`;
  }

  renderCampaign() {
    this.hideToast();
    this.screen = 'campaign';
    this.modal = '';
    if (this.scene.ready) this.scene.showMenu();
    this.music.menu();
    const unlocked = this.save.unlocked(this.race);
    this.ui.innerHTML = `<section class="campaign-screen">
      ${this.header('十三巢远征图 · 四幕纪事')}
      <div class="campaign-heading">
        <div><span class="eyebrow">行旅地图 · 四幕纪事</span><h2>循着巢灯，走回森林<span>选择你的下一场战斗</span></h2></div>
        <div class="campaign-total"><b>${pad(this.save.stars(this.race))}</b><span>/ 65 ★<small>战役星光</small></span></div>
      </div>
      <div class="campaign-layout">
        <aside class="race-panel"><span class="tiny">行旅族群</span><h3>选择虫族</h3>
          ${(['agile', 'fast', 'strong'] as RaceId[]).map((r) => `<button class="race-card ${this.race === r ? 'active' : ''} ${!this.save.raceUnlocked(r) ? 'locked' : ''}" data-action="race" data-value="${r}" ${!this.save.raceUnlocked(r) ? 'disabled' : ''}>
            <span class="bug-frame"><img src="${base}art/bug-${r}.svg" alt=""></span>
            <span><b>${raceName[r]}</b><small>${this.save.raceUnlocked(r) ? raceText[r] : '通关敏捷族战役后解锁'}</small></span>
            <i>${this.save.raceUnlocked(r) ? (this.race === r ? '✓' : '') : '◇'}</i>
          </button>`).join('')}
          <div class="field-note"><span>❧</span><p>王冠不是冠冕，而是归途灯环。<br>先占生产巢，再稳步向前。</p></div>
          <button class="text-button" data-action="menu">← 返回营地</button>
        </aside>
        <div class="expedition-pages">
          <div class="act-index">${ACTS.map((a, i) => `<span><b>第${['一', '二', '三', '四'][i]}幕 · ${a.name}</b><small>${a.theme}</small></span>`).join('')}</div>
          <div class="level-grid">${LEVELS.map((l, i) => {
            const result = this.save.data.results[this.race][l.id];
            const locked = l.id > unlocked;
            return `<button class="level-card biome-${l.biome} ${locked ? 'locked' : ''} ${l.id === unlocked ? 'current' : ''}" data-action="level" data-value="${i}" ${locked ? 'disabled' : ''}>
              <div class="level-art" style="background-image:url('${base}art/background-${l.biome}.svg')"><span class="level-no">${pad(l.id)}</span>${this.minimap(i)}<span class="level-state">${locked ? '◇' : result ? '✓' : '↗'}</span></div>
              <div class="level-info"><span class="tiny">${actForLevel(l.id).name} · ${BIOMES[l.biome]}</span><h4>${l.name}</h4>${result ? stars(result.stars) : `<span class="level-caption">${locked ? '完成上一关解锁' : l.id === unlocked ? '新的远征 →' : '等待挑战'}</span>`}</div>
            </button>`;
          }).join('')}</div>
        </div>
      </div>
      <div class="campaign-bottom">13 张原创重建战场 · 关卡布局非原版逐点复刻<span>难度：${{ easy: '悠闲', normal: '标准', hard: '战术' }[this.save.data.settings.difficulty]} <button data-action="settings">调整 ↗</button></span></div>
    </section>`;
  }

  /** DOM 迷你地图：阵营填充色 + 白描边；生产巢为圆点、炮塔为方块，形状与颜色双重区分。 */
  private minimap(index: number) {
    const l = LEVELS[index];
    const nodes = l.colonies.map((c) => c.kind === 'cannon'
      ? `<rect x="${c.x - 30}" y="${c.y - 130}" width="60" height="60" rx="9" fill="${FACTION_COLORS[c.owner]}" stroke="#fffdf7" stroke-width="8"/>`
      : `<circle cx="${c.x}" cy="${c.y - 100}" r="24" fill="${FACTION_COLORS[c.owner]}" stroke="#fffdf7" stroke-width="8"/>`).join('');
    return `<svg class="minimap" viewBox="0 0 1600 700" aria-hidden="true">${l.colonies.slice(1).map((c, i) => `<path d="M${l.colonies[i].x},${l.colonies[i].y - 100} L${c.x},${c.y - 100}" stroke="#5b7f92" stroke-opacity=".30" stroke-width="6" stroke-linecap="round"/>`).join('')}${nodes}</svg>`;
  }

  start(index: number) {
    if (!this.scene.ready) { this.toast('正在准备战场，请稍候'); return; }
    if (index < 0 || index >= LEVELS.length || index + 1 > this.save.unlocked(this.race)) return;
    this.levelIndex = index;
    this.screen = 'battle';
    this.modal = '';
    this.scene.reducedMotion = this.save.data.settings.reducedMotion;
    this.scene.start(LEVELS[index], this.race, this.save.data.settings.difficulty);
    this.music.startLevel(LEVELS[index]);
    this.renderBattle();
    this.hideToast();
  }

  private renderBattle() {
    const l = LEVELS[this.levelIndex];
    this.ui.innerHTML = `<section class="battle-screen">
      <header class="battle-top">
        <button class="battle-back" data-action="pause" aria-label="暂停">Ⅱ</button>
        <div class="chapter-number">${pad(l.id)}</div>
        <div class="battle-title"><span class="tiny">${BIOMES[l.biome]} / ${l.subtitle}</span><h3>${l.name}</h3><p class="battle-briefing">${BRIEFINGS[this.levelIndex]}</p></div>
        <div id="faction-scores" class="faction-scores"></div>
        <div class="battle-clock"><small>远征时间</small><b id="timer">00:00</b></div>
        <button class="icon-button" data-action="settings" aria-label="声音和设置">⚙</button>
      </header>
      <div class="battle-objective"><span class="objective-dot"></span>消灭所有敌方势力<span class="slash">/</span><span id="objective-status"></span></div>
      <div id="opening-grace" class="opening-grace" hidden></div>
      <div id="battle-tip" class="battle-tip" title="${l.tip}">${l.tip}</div>
      <footer class="battle-bottom">
        <div class="selection-info"><span class="bug-frame"><img src="${base}art/bug-${this.race}.svg" alt=""></span>
          <div><span class="tiny">${raceName[this.race]} · 蓝方</span><strong id="selection-count">选择你的虫巢</strong><small>点击选择 · 拖框多选 · 空格全选</small></div>
        </div>
        <div class="dispatch-panel"><span class="tiny">派遣兵力 <b id="send-count"></b></span>
          <div class="ratio-buttons">${[.25, .5, .75, 1].map((n) => `<button class="${this.scene.ratio === n ? 'active' : ''}" data-action="ratio" data-value="${n}">${n * 100}%</button>`).join('')}</div>
          <small>点击目标进攻或增援 · Shift 追加选择</small>
        </div>
        <button class="skill-button" data-action="skill" id="skill-button"><div class="skill-icon">❋<kbd>A</kbd></div>
          <div class="skill-copy"><span id="skill-label">孢子风暴</span><small id="energy-label">能量正在汇聚</small><div class="energy-track"><span id="energy-fill"></span></div></div>
          <b id="energy-value">0%</b>
        </button>
        <div class="battle-keys"><span><kbd>P</kbd>暂停</span><span><kbd>M</kbd>声音</span></div>
        <button class="bottom-help" data-action="help" aria-label="查看操作指南">?</button>
      </footer>
      <span class="battle-watermark">VERDANT CROWN <span id="perf"></span></span>
    </section>`;
    this.lastHUD = 0;
    this.updateHUD();
  }

  private updateHUD() {
    if (this.screen !== 'battle' || !this.scene.sim) return;
    const now = performance.now();
    if (now - this.lastHUD < 100) return;
    this.lastHUD = now;
    const w = this.scene.sim.world;
    const text = (id: string, value: string) => { const e = document.getElementById(id); if (e) e.textContent = value; };
    text('timer', clock(w.elapsed));
    const grace = Math.max(0, Math.ceil(this.scene.sim.openingGrace - w.elapsed));
    const graceEl = document.getElementById('opening-grace');
    if (graceEl) { graceEl.hidden = grace <= 0; graceEl.textContent = `观察准备期 ${grace}秒，双方正常生产`; }
    const own = w.colonies.filter((c) => c.owner === 1);
    text('objective-status', `${own.length} 座蓝方建筑 · ${w.colonies.filter((c) => c.owner > 1).length} 座敌方建筑`);
    text('selection-count', this.scene.selected.size ? `已选 ${this.scene.selected.size} 座建筑` : '选择你的虫巢');
    text('send-count', `${Math.floor(own.filter((c) => this.scene.selected.has(c.id)).reduce((s, c) => s + Math.floor(c.units * this.scene.ratio), 0))} 兵`);
    const energy = Math.floor(w.energy[1]);
    text('energy-value', `${energy}%`);
    text('energy-label', this.scene.skillArmed ? '点击战场施放 · 右键取消' : energy >= 100 ? '能量已满 · 按 A 选择区域' : '能量正在汇聚');
    text('skill-label', this.scene.skillArmed ? '选择施法区域' : '孢子风暴');
    document.getElementById('energy-fill')?.setAttribute('style', `width:${energy}%`);
    document.getElementById('skill-button')?.classList.toggle('ready', energy >= 100);
    document.getElementById('skill-button')?.classList.toggle('armed', this.scene.skillArmed);

    const scores = document.getElementById('faction-scores');
    if (scores) scores.innerHTML = w.factions.map((f) => {
      const nodes = w.colonies.filter((c) => c.owner === f.id);
      const units = Math.floor(nodes.reduce((s, c) => s + c.units, 0) + w.fleets.filter((s) => s.owner === f.id).reduce((s, c) => s + c.count, 0));
      const mark = f.id === 1 ? '✓' : '';
      return `<span class="faction-score faction-${f.id} ${units === 0 && !nodes.length ? 'eliminated' : ''}"><i class="faction-mark mark-${f.id}" aria-hidden="true">${mark}</i><b>${formatUnits(units)}</b><small>${nodes.length} 巢</small></span>`;
    }).join('');
    text('perf', `${Math.round(this.scene.fps)} FPS`);
    document.getElementById('battle-tip')?.classList.toggle('faded', w.elapsed > 20);
  }

  private end(status: string) {
    if (this.screen !== 'battle') return;
    this.hideToast();
    this.screen = 'result';
    this.modal = '';
    const w = this.scene.sim!.world;
    const l = LEVELS[this.levelIndex];
    const win = status === 'won';
    const rating = win ? rateVictory(w.elapsed, w.stats.lost, l.par) : 0;
    const earned = win ? this.save.record(this.race, l.id, { stars: rating, time: w.elapsed, lost: w.stats.lost }, w.stats) : [];
    this.music.result(win);
    this.ui.innerHTML = `<section class="result-screen"><div class="result-card ${win ? 'won' : 'lost'}">
      <div class="eyebrow">${win ? '守望记录 / 巢灯重燃' : '行旅暂歇 / 归途仍在'}</div>
      <div class="result-sigil">${win ? `<img src="${base}art/emblem.svg" alt="种核与守望灯环">` : '❧'}</div>
      <h1>${win ? (l.id === 13 ? '十三盏灯，终于相逢' : '又一盏巢灯亮起') : '先歇一程，再点亮巢灯'}</h1>
      <p>${l.name} · ${win ? '守望巢重新迎来了归途中的行旅' : '先占近处生产巢，别急冲敌方；用 50% 派兵，留下驻军再增援'}</p>
      ${win ? stars(rating) : '<div class="defeat-line"></div>'}
      <div class="result-stats"><div><small>战斗时间</small><strong>${clock(w.elapsed)}</strong></div><div><small>占领建筑</small><strong>${w.stats.captures}</strong></div><div><small>失守建筑</small><strong>${w.stats.lost}</strong></div><div><small>派遣兵力</small><strong>${w.stats.sent}</strong></div></div>
      ${earned.length ? `<div class="earned">♜ 解锁成就：${earned.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name).join(' · ')}</div>` : ''}
      ${win && l.id === 13 ? `<div class="crown-message">种核回到树心，翡翠王冠成为照亮归途的灯环。${this.race === 'agile' ? '疾行族与重甲族现已解锁。' : '这条归途已记入林地纪事。'}</div>` : ''}
      <div class="result-buttons">
        ${win && l.id < 13 ? `<button class="button primary" data-action="next">继续远征 →</button>` : `<button class="button primary" data-action="retry">${win ? '再次挑战' : '重返战场'} ↗</button>`}
        <button class="button secondary" data-action="campaign">战役地图</button>
        ${!win ? '<button class="button secondary" data-action="retry-easy">改为悠闲再试</button>' : ''}
        ${win && l.id < 13 ? '<button class="text-button" data-action="retry">重试本关</button>' : ''}
      </div>
      <small class="result-note">${win ? '评级依据：速度与建筑失守次数 · 最佳成绩已自动保存' : '本次未通关 · 已有的最佳成绩保持不变'}${this.save.available ? '' : '（浏览器存储不可用，仅本次会话有效）'}</small>
    </div></section>`;
  }

  private feedback(n: string) {
    if (n === 'not-ready') this.toast('能量未满。等待能量达到 100% 后施法。');
    else if (n === 'invalid') this.toast('请先选择有兵力的己方虫巢');
    else if (['select', 'dispatch', 'capture', 'impact'].includes(n)) {
      this.audio.play(n as 'select');
      if (n === 'dispatch') this.audio.play('march');
    } else if (n === 'shot') this.audio.play('impact');
    else if (n === 'cast') this.audio.play('skill');
  }

  private pause() {
    if (this.screen !== 'battle') return;
    if (this.modal === 'pause') { this.closeModal(); return; }
    if (this.modal) return;
    this.wasPaused = false;
    this.scene.cancelGesture();
    this.scene.paused = true;
    this.music.setPaused(true);
    this.modal = 'pause';
    this.overlay(`<span class="eyebrow">雨声暂歇</span><h2>林间小憩</h2><p>虫群正在等候你的指令。</p><div class="modal-stack"><button class="button primary" data-action="close">继续战斗 →</button><button class="button secondary" data-action="retry">重新挑战</button><button class="button secondary" data-action="campaign">返回战役地图</button></div><span class="hint">P / Esc 返回战场</span>`);
  }

  private overlay(html: string, wide = false) {
    document.getElementById('modal')?.remove();
    const el = document.createElement('div');
    el.id = 'modal';
    el.className = 'modal-backdrop';
    el.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="modal-close" data-action="close" aria-label="关闭">×</button>${html}</div>`;
    this.ui.append(el);
    el.querySelector<HTMLElement>('button:not(.modal-close)')?.focus();
  }

  private openModal(name: string) {
    this.wasPaused = this.scene.paused;
    this.scene.cancelGesture();
    this.scene.paused = true;
    this.music.setPaused(true);
    this.modal = name;
  }

  private closeModal() {
    document.getElementById('modal')?.remove();
    this.modal = '';
    if (this.screen === 'battle') this.scene.paused = this.wasPaused;
    this.music.setPaused(this.screen === 'battle' && this.scene.paused);
  }

  private settings() {
    this.openModal('settings');
    const s = this.save.data.settings;
    this.overlay(`<span class="eyebrow">声音与行旅设置</span><h2>让森林听起来刚刚好</h2><div class="settings-list">${(['master', 'music', 'sfx'] as const).map((k) => `<label><span>${{ master: '主音量', music: '背景音乐', sfx: '游戏音效' }[k]}</span><input aria-label="${k}" type="range" min="0" max="100" value="${s[k] * 100}" data-setting="${k}"><output>${Math.round(s[k] * 100)}%</output></label>`).join('')}<label><span>静音 <small>M 快捷切换</small></span><input type="checkbox" data-setting="muted" ${s.muted ? 'checked' : ''}></label><label><span>减少环境动画</span><input type="checkbox" data-setting="reducedMotion" ${s.reducedMotion ? 'checked' : ''}></label><label><span>对手策略难度 <small>下一场战斗生效</small></span><select data-setting="difficulty"><option value="easy" ${s.difficulty === 'easy' ? 'selected' : ''}>悠闲 · 更多思考时间</option><option value="normal" ${s.difficulty === 'normal' ? 'selected' : ''}>标准 · 循序渐进</option><option value="hard" ${s.difficulty === 'hard' ? 'selected' : ''}>战术 · 更快协同反应</option></select></label></div><button class="button primary" data-action="close">保存并返回</button><p class="hint">设置自动保存在本机。音乐在首次点击后启用。</p>`);
    document.getElementById('modal')?.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const key = el.dataset.setting;
      if (!key) return;
      const value = el.type === 'range' ? Number(el.value) / 100 : el.type === 'checkbox' ? el.checked : el.value;
      Object.assign(this.save.data.settings, { [key]: value });
      if (el.type === 'range') el.nextElementSibling!.textContent = `${el.value}%`;
      this.scene.reducedMotion = this.save.data.settings.reducedMotion;
      this.audio.configure(this.save.data.settings);
      this.save.persist();
    });
  }

  private help() {
    this.openModal('help');
    this.overlay(`<span class="eyebrow">日光花园 · 操作手册</span><h2>从最近的一座巢开始</h2><p class="first-route">新手第一步：点己方蓝巢 → 选 50% → 点近处中立生产巢 → 等待生产，再增援。第 2 关先占近处生产巢，别急冲敌方。</p><div class="guide-grid"><article><b>01 / 扩张</b><h3>生产巢是你的根基</h3><p>占领带巢穴的建筑，它们持续生产虫兵，没有人口上限。炮塔不生产，需要增援，但会自动射击敌方行军。</p></article><article><b>02 / 指挥</b><h3>点击、拖拽、联合进攻</h3><p>点己方虫巢，再点目标派兵；或从己巢拖到目标。空地拖框多选，Shift追加，空格全选。点友方可增援。</p></article><article><b>03 / 时机</b><h3>留下后手，集中优势</h3><p>底部选择25–100%派兵比例。军队行进中不能改道。不同种族的速度与攻防不同，切勿只看数量。</p></article><article><b>04 / 风暴</b><h3>用一次施法扭转战局</h3><p>能量100%后按 A 或点技能，再点区域。范围135内敌方驻军与行军最多各损失18，友军安全。Esc/右键取消。</p></article></div><div class="guide-footer"><span><kbd>P</kbd> 暂停 <kbd>M</kbd> 静音 <kbd>Esc</kbd> 取消 / 暂停</span><span>全灭敌方建筑与在途军队获胜 · 速度和失守影响星级</span></div><p class="hint">13关与基础系统参考原作；具体地图、数值与孢子风暴效果为保守重建，并非已核实的原版参数。</p><button class="button primary" data-action="close">明白了，出发 →</button>`, true);
  }

  private achievements() {
    this.openModal('achievements');
    this.overlay(`<span class="eyebrow">行旅留下的痕迹</span><h2>花园荣誉册 <small>${this.save.data.achievements.length}/12</small></h2><div class="achievement-grid">${ACHIEVEMENTS.map((a) => `<article class="achievement ${this.save.data.achievements.includes(a.id) ? 'earned-badge' : ''}"><span>♜</span><div><b>${a.name}</b><p>${a.text}</p></div>${this.save.data.achievements.includes(a.id) ? '<i>✓</i>' : ''}</article>`).join('')}</div><button class="button primary" data-action="close">返回营地</button>`, true);
  }

  private lore() {
    this.openModal('lore');
    this.overlay(`<span class="eyebrow">日光花园 / 雨后纪事</span><h2>王冠不是一顶皇冠</h2><p>${LORE_NOTICE}</p><div class="lore-grid">${ACTS.map((a, i) => `<article><span class="tiny">第${['一', '二', '三', '四'][i]}幕 · ${a.theme}</span><h3>${a.name}</h3><p>${a.text}</p></article>`).join('')}</div><p class="hint">重连是故事意象，不是连线经济机制。获胜仍须击败全部敌方建筑及在途部队；无需全占中立巢。</p><button class="button primary" data-action="close">合上纪事，继续行旅</button>`, true);
  }

  private credits() {
    this.openModal('credits');
    this.overlay(`<span class="eyebrow">研究参考与原创边界</span><h2>以热爱，重建一个小世界</h2><p>《虫界战争 · 翡翠王冠》是以 Rudy Sudarto / Artlogic 的 Bug War 2 为研究参考的独立、非官方重制。未使用原版SWF或受保护的画面与声音素材。</p><div class="credits-columns"><article><h3>玩法研究</h3><p>Kongregate / Newgrounds 作者说明<br>MaxGames 操作手册<br>Anne in Red（2010）同期评测</p></article><article><h3>原创制作</h3><p>场景、虫巢、虫兵：自制SVG<br>真实管弦采样 · 原创编曲 · 自适应分层配乐<br>Phaser 3 · TypeScript · Web Audio</p></article></div><p class="hint">13张关卡地图、战斗数值、AI、魔法具体效果、评分阈值为原创重建。原版细节仍有未确认部分，完整证据与差异见项目 docs/original-game-analysis.md。非官方关联、无原作者背书。</p><button class="button primary" data-action="close">返回</button>`, true);
  }

  private action(action: string, value?: string) {
    switch (action) {
      case 'lore': this.lore(); break;
      case 'retry-easy':
        this.save.data.settings.difficulty = 'easy';
        this.save.persist();
        this.start(this.levelIndex);
        break;
      case 'menu': this.renderMenu(); break;
      case 'campaign': this.renderCampaign(); break;
      case 'race':
        if (this.save.raceUnlocked(value as RaceId)) { this.race = value as RaceId; this.renderCampaign(); }
        break;
      case 'level': this.start(Number(value)); break;
      case 'retry': this.start(this.levelIndex); break;
      case 'next': this.start(this.levelIndex + 1); break;
      case 'ratio':
        this.scene.ratio = Number(value);
        this.ui.querySelectorAll('.ratio-buttons button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.value === value));
        break;
      case 'skill': this.scene.armSkill(); break;
      case 'pause': this.pause(); break;
      case 'close': this.closeModal(); break;
      case 'settings': this.settings(); break;
      case 'help': this.help(); break;
      case 'achievements': this.achievements(); break;
      case 'credits': this.credits(); break;
    }
  }

  private hideToast() {
    clearTimeout(this.toastTimer);
    document.getElementById('toast')?.classList.remove('show');
  }

  toast(message: string, duration = 3200) {
    const el = document.getElementById('toast')!;
    clearTimeout(this.toastTimer);
    el.textContent = message;
    el.classList.add('show');
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), duration);
  }
}

new Application();

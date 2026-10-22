import Phaser from 'phaser';
import { Simulation } from '../core/Simulation';
import { BATTLE_RULES } from '../core/rules';
import { formatUnits } from '../ui/format';
import { directSources, previewSourceSet, roadPreview, roadSegments, type RoadSegment } from './roadRender';
import type { BuildingKind, Colony, Difficulty, GameEvent, LevelConfig, RaceId } from '../core/types';

/**
 * Sunlit Garden battlefield renderer, matching the approved art direction in
 * docs/art-direction.md (approved cover v2).
 *
 * This scene owns presentation and input only. Road legality comes exclusively
 * from the live `world.roads` list through `core/roads.hasRoad`: every dispatch
 * source must touch the target directly (no relay through a third colony), for
 * the player and the AI alike. Simulation remains the authority for economy,
 * combat, statistics and win/lose.
 *
 * The visual language is bright daylight: owner-specific SVG textures (never a
 * full-sprite tint), warm number plates with shape-coded faction marks, readable
 * skill/ballistic feedback, and a clean menu backdrop. Roads are permanently
 * visible straight lanes because fleets travel in a straight line along the same
 * logical edge; they are only trimmed outside the building art. Selecting a
 * friendly nest highlights its direct neighbours and the actual lanes to them. A
 * preview never draws a synthetic line between non-adjacent colonies: highlighting
 * is derived from the same road segments and hasRoad checks that dispatch uses.
 *
 * Feedback contract (onAction names consumed by the DOM UI):
 *   'no-road'           target is not directly connected to any selected source.
 *                       Nothing was dispatched; units and statistics are unchanged.
 *                       UI should toast a road/adjacency message, e.g.
 *                       "目标未与所选巢穴直接相连，无法派兵".
 *   'partial-dispatch'  at least one selected source was skipped because it had no
 *                       road to the target, while road-connected sources did send.
 *                       It replaces 'dispatch' for that order (successful, but not
 *                       from every selected source). UI may toast
 *                       "只有与目标相邻的巢穴派出了兵力".
 *   Existing names keep their meaning: 'select', 'dispatch', 'invalid', 'cancel',
 *   'not-ready', 'cast'. 'invalid' now only covers non-road failures such as a
 *   connected source with no available units.
 *
 * Asset contract under public/art:
 *   background-{meadow,roots,marsh,amber}.svg  1600x900 daylight garden
 *   nest-{0..4}.svg, cannon-{0..4}.svg         160x160, faction roof/shell material
 *   bug-{agile,fast,strong}-{0..4}.svg         96x32, four clipped 24x32 frames
 *   nest.svg, cannon.svg, bug-*.svg            compatibility files kept for the UI
 *
 * Missing owner variants fall back to the default compatibility texture so the
 * scene stays playable during an asset regeneration; the plate mark, badge and
 * base ring always encode the owner by colour *and* shape, so identity never
 * depends on tint.
 */

/** Faction palette shared with the DOM UI; main.ts also uses HEX for minimap dots. */
export const COLORS = [0x92a18b, 0x327fc1, 0xc85f48, 0x8b70ba, 0xc49336];
export const HEX = ['#92A18B', '#327FC1', '#C85F48', '#8B70BA', '#C49336'];

const OWNERS = [0, 1, 2, 3, 4] as const;
const RACES = ['agile', 'fast', 'strong'] as const;
const BIOMES = ['meadow', 'roots', 'marsh', 'amber'] as const;

// Daylight interface palette: warm paper plates, deep leaf ink, clear route blue.
const INK = '#20352a';
const PLATE = 0xfbf8ee;
const PLATE_SHADOW = 0x2a3a2c;
const HALO = 0xfffdf4;
const SELECT = 0x1c6fb8;
const ROUTE = 0x2f86d6;
const MINT = 0x9fd7c3;
const BALLISTIC = 0xe8b96a;
const SPARK = 0xfff3cf;

// Road palette: trodden warm earth with a pale rim, readable on both the light
// field and the darker garden bed without competing with faction colours.
const ROAD_SHADE = 0x5d7355;
const ROAD_RIM = 0xfffdf4;
const ROAD_SAND = 0xdfcfa6;
const ROAD_LIGHT = 0xf6eed6;
const ROAD_DOT = 0xb9a87c;

// Fixed layout, kept close to the previous 125/116 / +53 / -66 rhythm so the
// existing 13-level label clearances and the <792px bottom check still hold.
const BUILDING_SIZE: Record<BuildingKind, number> = { nest: 132, cannon: 122 };
const BUILDING_Y = -9;
const NUMBER_Y = 53;
const BADGE_Y = -66;
const PLATE_W = 100;
const PLATE_H = 34;
const NUMBER_DX = 9;
const MARK_DX = -35;
// The plate reserves a fixed slot between the owner mark and the paper edge.
// Normal values render at 24px; only extreme strings such as "1000.0B" shrink.
const NUMBER_FONT = 24;
const NUMBER_MIN_FONT = 11;
const NUMBER_MAX_W = 64;
const UNIT_BATCH = 36;
const UNIT_CAP = 1000;
const UNIT_SCALE: Record<RaceId, number> = { agile: 0.58, fast: 0.58, strong: 0.66 };

const colonyLabel = (c: Pick<Colony, 'owner' | 'kind'>) =>
  `${c.owner === 1 ? '己方' : c.owner === 0 ? '中立' : '敌方'} · ${c.kind === 'nest' ? '生产巢' : '炮塔'}`;

interface ColonyView {
  image: Phaser.GameObjects.Image;
  number: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Text;
  owner: number;
}
interface Effect {
  event: GameEvent;
  age: number;
  life: number;
}
export class BattleScene extends Phaser.Scene {
  sim: Simulation | null = null; level: LevelConfig | null = null; selected = new Set<string>(); ratio = .5; paused = false; skillArmed = false; ready = false; reducedMotion = false; fps = 60; visualUnits = 0;
  onTick: () => void = () => {}; onAction: (name: string) => void = () => {}; onEnd: (status: string) => void = () => {};
  private bg!: Phaser.GameObjects.Image;
  private ground!: Phaser.GameObjects.Graphics;
  private roadBase!: Phaser.GameObjects.Graphics;
  private roadHi!: Phaser.GameObjects.Graphics;
  private plates!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Graphics;
  private views = new Map<string, ColonyView>();
  private bugs = new Map<number, Phaser.GameObjects.Sprite[]>();
  private fx: Effect[] = [];
  private roadLanes: RoadSegment[] = [];
  private drag: { x: number; y: number; source: string | null; active: boolean } | null = null;
  private clock = 0;
  private notified = false;

  constructor() { super('battle'); }

  preload() {
    const base = import.meta.env.BASE_URL;
    for (const biome of BIOMES) this.load.svg(`bg-${biome}`, `${base}art/background-${biome}.svg`);
    // Compatibility textures stay loaded for the DOM UI and as texture fallbacks.
    for (const name of ['nest', 'cannon', 'emblem', 'bug-agile', 'bug-fast', 'bug-strong']) this.load.svg(name, `${base}art/${name}.svg`);
    for (const owner of OWNERS) {
      this.load.svg(`nest-${owner}`, `${base}art/nest-${owner}.svg`);
      this.load.svg(`cannon-${owner}`, `${base}art/cannon-${owner}.svg`);
    }
    for (const race of RACES) for (const owner of OWNERS) this.load.svg(`bug-${race}-${owner}`, `${base}art/bug-${race}-${owner}.svg`);
  }

  create() {
    this.registerUnitFrames();
    this.bg = this.add.image(800, 450, 'bg-meadow').setDisplaySize(1600, 900);
    this.ground = this.add.graphics().setDepth(1);
    // Static road bed (drawn once per level) stays under the ground feedback but
    // above the backdrop; selection overlays sit under buildings and number plates.
    this.roadBase = this.add.graphics().setDepth(0.6);
    this.roadHi = this.add.graphics().setDepth(6);
    this.plates = this.add.graphics().setDepth(11);
    this.top = this.add.graphics().setDepth(30);
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.down(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.drag && Phaser.Math.Distance.Between(this.drag.x, this.drag.y, p.x, p.y) > 12) this.drag.active = true;
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.up(p));
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (!this.sim || this.paused || this.sim.world.status !== 'playing') return;
      if (e.code === 'Space') { e.preventDefault(); this.selectAll(); }
      if (e.code === 'KeyA') { e.preventDefault(); this.armSkill(); }
      if (e.code === 'Escape') { this.skillArmed = false; this.selected.clear(); this.drag = null; this.onAction('cancel'); }
    });
    this.ready = true;
    this.showMenu();
  }

  /** Bright meadow only: the approved cover is a DOM layer owned by the UI pass. */
  showMenu() {
    if (!this.ready) return;
    this.clearBoard();
    this.sim = null;
    this.level = null;
    this.paused = false;
    this.selected.clear();
    this.skillArmed = false;
    this.game.canvas.style.cursor = 'default';
    this.bg.setTexture('bg-meadow');
    this.visualUnits = 0;
  }

  start(level: LevelConfig, race: RaceId, difficulty: Difficulty) {
    this.clearBoard();
    this.level = level;
    this.sim = new Simulation(level, race, difficulty);
    this.selected.clear();
    this.paused = false;
    this.skillArmed = false;
    this.notified = false;
    this.bg.setTexture(`bg-${level.biome}`);
    this.roadLanes = roadSegments(this.sim.world.roads, this.sim.world.colonies);
    this.drawRoadBase();
    for (const c of this.sim.world.colonies) {
      const size = BUILDING_SIZE[c.kind];
      const image = this.add.image(c.x, c.y + BUILDING_Y, this.buildingTexture(c.kind, c.owner)).setDisplaySize(size, size).setDepth(7);
      const number = this.add.text(c.x + NUMBER_DX, c.y + NUMBER_Y, '', {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${NUMBER_FONT}px`, fontStyle: 'bold', color: INK,
      }).setResolution(2).setOrigin(.5).setDepth(13);
      const badge = this.add.text(c.x, c.y + BADGE_Y, colonyLabel(c), {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif', fontSize: '12px', color: INK,
        stroke: '#fbf8ee', strokeThickness: 3, letterSpacing: .5,
      }).setResolution(2).setOrigin(.5).setDepth(12);
      const view: ColonyView = { image, number, badge, owner: c.owner };
      this.views.set(c.id, view);
      this.fitNumber(view, formatUnits(c.units));
    }
    this.onTick();
  }

  private clearBoard() {
    for (const v of this.views.values()) { v.image.destroy(); v.number.destroy(); v.badge.destroy(); }
    this.views.clear();
    for (const list of this.bugs.values()) list.forEach(s => s.destroy());
    this.bugs.clear();
    this.fx = [];
    this.drag = null;
    this.selected.clear();
    this.tweens.killAll();
    this.roadLanes = [];
    this.roadBase?.clear();
    this.roadHi?.clear();
    this.ground?.clear();
    this.plates?.clear();
    this.top?.clear();
    this.visualUnits = 0;
  }

  selectAll() {
    if (!this.sim) return;
    this.selected = new Set(this.sim.world.colonies.filter(c => c.owner === 1).map(c => c.id));
    this.onAction('select');
    this.onTick();
  }

  armSkill() {
    if (!this.sim || this.sim.world.energy[1] < BATTLE_RULES.skillCost) { this.onAction('not-ready'); return; }
    this.skillArmed = !this.skillArmed;
    this.onAction('select');
    this.onTick();
  }

  private hit(x: number, y: number): Colony | undefined {
    return this.sim?.world.colonies.find(c => Math.hypot(c.x - x, c.y - y) < 68);
  }

  private down(p: Phaser.Input.Pointer) {
    if (!this.sim || this.paused || this.sim.world.status !== 'playing') return;
    if (p.rightButtonDown()) { this.skillArmed = false; this.selected.clear(); this.drag = null; this.onTick(); return; }
    if (p.y < 160 || p.y > 782) return;
    if (this.skillArmed) {
      if (this.sim.castSkill(1, p.x, p.y)) { this.skillArmed = false; this.onAction('cast'); }
      return;
    }
    const c = this.hit(p.x, p.y);
    this.drag = { x: p.x, y: p.y, source: c?.owner === 1 ? c.id : null, active: false };
  }

  cancelGesture() { this.drag = null; }

  /**
   * The sources a preview should show. While dragging from a not-yet-selected
   * nest, the preview must reflect the pending single-source order; otherwise it
   * mirrors the current multi-selection. Dispatch itself always re-filters with
   * directSources(), so preview and Simulation ask hasRoad the same question.
   */
  private previewSources(): Set<string> {
    return previewSourceSet(this.selected, this.drag?.source);
  }

  private up(p: Phaser.Input.Pointer) {
    const d = this.drag;
    this.drag = null;
    if (!this.sim || this.paused || this.sim.world.status !== 'playing' || !d) return;
    const hit = this.hit(p.x, p.y);
    const shift = p.event instanceof MouseEvent && p.event.shiftKey;
    if (d.active) {
      if (d.source) {
        if (!hit || hit.id === d.source) return;
        const sources = this.selected.has(d.source) ? this.selected : new Set([d.source]);
        if (!directSources(this.sim.world.roads, sources, hit.id).length) {
          this.onAction('no-road');
          this.onTick();
          return;
        }
        if (!this.selected.has(d.source)) this.selected = new Set([d.source]);
        this.send(hit.id);
      } else {
        if (!shift) this.selected.clear();
        for (const c of this.sim.world.colonies) if (c.owner === 1 && c.x >= Math.min(d.x, p.x) && c.x <= Math.max(d.x, p.x) && c.y >= Math.min(d.y, p.y) && c.y <= Math.max(d.y, p.y)) this.selected.add(c.id);
        this.onAction('select');
      }
    } else if (hit) {
      if (hit.owner === 1) {
        if (shift) {
          if (this.selected.has(hit.id)) this.selected.delete(hit.id);
          else this.selected.add(hit.id);
          this.onAction('select');
        } else if (this.selected.has(hit.id)) {
          // Collapse a multi-selection to the clicked nest without sending.
          this.selected = new Set([hit.id]);
          this.onAction('select');
        } else if (this.selected.size && directSources(this.sim.world.roads, this.selected, hit.id).length) {
          // Connected friendly target: reinforcement order.
          this.send(hit.id);
        } else {
          // Non-adjacent (or no current selection): a click must always be able
          // to reselect instead of failing an impossible reinforcement. A drag
          // is still an explicit order and is rejected with 'no-road' above.
          this.selected = new Set([hit.id]);
          this.onAction('select');
        }
      } else if (this.selected.size) this.send(hit.id);
      else this.onAction('invalid');
    } else if (!shift) this.selected.clear();
    this.onTick();
  }

  /**
   * Dispatch only from selected nests that actually touch the target. Simulation
   * repeats the same check; this pre-filter exists to report partial orders and
   * to avoid pretending that an illegal order was accepted.
   */
  private send(target: string) {
    const sim = this.sim!;
    const all = [...this.selected];
    const sources = directSources(sim.world.roads, all, target);
    if (!sources.length) {
      this.onAction('no-road');
      this.onTick();
      return;
    }
    const n = sim.dispatch(sources, target, this.ratio, 1);
    if (n > 0) {
      const eligible = all.filter((id) => id !== target).length;
      this.onAction(sources.length < eligible ? 'partial-dispatch' : 'dispatch');
    } else this.onAction('invalid');
    this.onTick();
  }

  update(_time: number, delta: number) {
    this.clock += Math.min(delta, 100) / 1000;
    this.fps = this.game.loop.actualFps;
    const dt = Math.min(delta / 1000, .15);
    this.ground.clear();
    this.plates.clear();
    this.top.clear();
    this.roadHi.clear();
    if (!this.sim) { this.ambient(); return; }
    if (!this.paused) {
      this.sim.step(dt);
      for (const e of this.sim.drainEvents()) {
        if (e.type !== 'dispatch') this.fx.push({ event: e, age: 0, life: e.type === 'skill' ? 1.8 : e.type === 'capture' ? 1.4 : .55 });
        if (e.type === 'capture' || e.type === 'impact' || e.type === 'shot') this.onAction(e.type);
      }
    }
    for (const id of this.selected) if (this.sim.world.colonies.find(c => c.id === id)?.owner !== 1) this.selected.delete(id);
    this.renderColonies();
    this.renderRoadSelection();
    this.renderFleets();
    this.renderEffects(this.paused ? 0 : dt);
    this.renderInput();
    this.ambient();
    if (this.sim.world.status !== 'playing' && !this.notified) { this.notified = true; this.onEnd(this.sim.world.status); }
    this.onTick();
  }

  // ---------------------------------------------------------------------------
  // Assets: owner variants stay whole; no setTint is applied to buildings or units.
  // ---------------------------------------------------------------------------
  private registerUnitFrames() {
    const seen = new Set<string>();
    for (const race of RACES) for (const owner of OWNERS) {
      const key = this.unitTexture(race, owner);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!this.textures.exists(key)) continue;
      const texture = this.textures.get(key);
      for (let frame = 0; frame < 4; frame++) if (!texture.has(String(frame))) texture.add(frame, 0, frame * 24, 0, 24, 32);
    }
  }

  private buildingTexture(kind: BuildingKind, owner: number) {
    const key = `${kind}-${owner}`;
    return this.textures.exists(key) ? key : kind;
  }

  private unitTexture(race: RaceId, owner: number) {
    const key = `bug-${race}-${owner}`;
    return this.textures.exists(key) ? key : `bug-${race}`;
  }

  private ownerColor(owner: number) { return COLORS[owner] ?? COLORS[0]; }

  // ---------------------------------------------------------------------------
  // Colonies: soft contact shadow, pale faction floor, selected brackets outside
  // the artwork, and a warm paper number plate with a shape-coded owner mark.
  // ---------------------------------------------------------------------------
  private renderColonies() {
    const g = this.ground;
    for (const c of this.sim!.world.colonies) {
      const v = this.views.get(c.id);
      if (!v) continue;
      const color = this.ownerColor(c.owner);
      const selected = this.selected.has(c.id);
      g.fillStyle(0x3f5844, .10); g.fillEllipse(c.x + 3, c.y + 36, 124, 28);
      g.fillStyle(0x3f5844, .055); g.fillEllipse(c.x, c.y + 33, 154, 44);
      g.fillStyle(color, c.owner === 0 ? .045 : .09); g.fillEllipse(c.x, c.y + 20, 152, 94);
      g.lineStyle(5, HALO, selected ? .55 : .18); g.strokeEllipse(c.x, c.y + 20, 148, 90);
      g.lineStyle(selected ? 2.3 : 1.3, color, selected ? .95 : .38); g.strokeEllipse(c.x, c.y + 20, 148, 90);
      if (selected) {
        g.lineStyle(5, HALO, .35); g.strokeEllipse(c.x, c.y + 20, 162, 102);
        g.lineStyle(2.6, SELECT, 1); g.strokeEllipse(c.x, c.y + 20, 162, 102);
        this.brackets(this.top, c.x, c.y + BUILDING_Y, 88, 70, HALO, .9, 5.2);
        this.brackets(this.top, c.x, c.y + BUILDING_Y, 88, 70, SELECT, 1, 2.6);
      }
      if (c.kind === 'cannon' && selected) {
        this.dashedCircle(this.top, c.x, c.y, BATTLE_RULES.cannonRange, HALO, .3, 4, 12, 10);
        this.dashedCircle(this.top, c.x, c.y, BATTLE_RULES.cannonRange, color, .38, 1.6, 12, 10);
      }
      // Resolve a capture before drawing this frame's plate, badge and mark so the
      // owner shape, label and texture all switch together.
      if (v.owner !== c.owner) {
        v.owner = c.owner;
        v.badge.setText(colonyLabel(c));
        const size = BUILDING_SIZE[c.kind];
        // Capture is a real texture swap, not a tint: same material, new faction colours.
        // Stop any in-flight capture fade so rapid re-captures cannot fight over alpha.
        this.tweens.killTweensOf(v.image);
        v.image.setTexture(this.buildingTexture(c.kind, c.owner)).setDisplaySize(size, size);
        if (this.reducedMotion) v.image.setAlpha(1);
        else {
          v.image.setAlpha(.35);
          this.tweens.add({ targets: v.image, alpha: 1, duration: 520, ease: 'Sine.easeOut' });
        }
      }
      this.drawNumberPlate(c, selected);
      this.drawBadgePlate(c, color);
      this.fitNumber(v, formatUnits(c.units));
      v.badge.setAlpha(selected ? 1 : .94);
    }
  }

  /** Keep the numeral inside its plate slot; never widen the plate or move the mark. */
  private fitNumber(v: ColonyView, text: string) {
    if (v.number.text === text) return;
    if (v.number.style.fontSize !== `${NUMBER_FONT}px`) v.number.setFontSize(NUMBER_FONT);
    v.number.setText(text);
    const width = v.number.width;
    if (width <= NUMBER_MAX_W) return;
    const size = Math.max(NUMBER_MIN_FONT, Math.floor(NUMBER_FONT * NUMBER_MAX_W / width));
    v.number.setFontSize(size);
    if (v.number.width > NUMBER_MAX_W) v.number.setFontSize(Math.max(NUMBER_MIN_FONT, size - 1));
  }

  private drawNumberPlate(c: Colony, selected: boolean) {
    const g = this.plates;
    const x = c.x, y = c.y + NUMBER_Y, color = this.ownerColor(c.owner);
    const left = x - PLATE_W / 2, top = y - PLATE_H / 2;
    g.fillStyle(PLATE_SHADOW, .14); g.fillRoundedRect(left + 1.5, top + 2.5, PLATE_W, PLATE_H, 11);
    g.fillStyle(PLATE, .97); g.fillRoundedRect(left, top, PLATE_W, PLATE_H, 11);
    g.lineStyle(selected ? 2.2 : 1.3, color, selected ? .98 : .62); g.strokeRoundedRect(left, top, PLATE_W, PLATE_H, 11);
    g.lineStyle(1, 0xffffff, .75); g.lineBetween(left + 12, top + 3.5, left + PLATE_W - 12, top + 3.5);
    this.drawOwnerMark(g, x + MARK_DX, y, c.owner);
  }

  private drawBadgePlate(c: Colony, color: number) {
    const v = this.views.get(c.id);
    if (!v) return;
    const w = v.badge.width + 12, h = v.badge.height + 5;
    const left = c.x - w / 2, top = c.y + BADGE_Y - h / 2;
    this.plates.fillStyle(PLATE, .82); this.plates.fillRoundedRect(left, top, w, h, 6);
    this.plates.lineStyle(1, color, .35); this.plates.strokeRoundedRect(left, top, w, h, 6);
  }

  /** Colour + shape double encoding: circle/check, diamond/bar, triangle, square, ring. */
  private drawOwnerMark(g: Phaser.GameObjects.Graphics, x: number, y: number, owner: number) {
    const color = this.ownerColor(owner);
    if (owner === 1) {
      g.fillStyle(color, 1); g.fillCircle(x, y, 8.5);
      g.lineStyle(1.4, HALO, .95); g.strokeCircle(x, y, 8.5);
      g.lineStyle(2.4, HALO, 1);
      g.beginPath(); g.moveTo(x - 3.8, y + .2); g.lineTo(x - 1.1, y + 3.4); g.lineTo(x + 4.4, y - 3.4); g.strokePath();
    } else if (owner === 2) {
      const diamond = [{ x, y: y - 8.5 }, { x: x + 8.5, y }, { x, y: y + 8.5 }, { x: x - 8.5, y }];
      g.fillStyle(color, 1); g.fillPoints(diamond, true);
      g.lineStyle(1.2, HALO, .95); g.strokePoints(diamond, true, true);
      g.lineStyle(2.2, HALO, 1); g.lineBetween(x - 4, y, x + 4, y);
    } else if (owner === 3) {
      g.fillStyle(color, 1); g.fillTriangle(x, y - 8.5, x + 8.5, y + 6, x - 8.5, y + 6);
      g.lineStyle(1.2, HALO, .95); g.strokeTriangle(x, y - 8.5, x + 8.5, y + 6, x - 8.5, y + 6);
    } else if (owner === 4) {
      g.fillStyle(color, 1); g.fillRect(x - 7.5, y - 7.5, 15, 15);
      g.lineStyle(1.2, HALO, .95); g.strokeRect(x - 7.5, y - 7.5, 15, 15);
    } else {
      g.lineStyle(2.2, color, 1); g.strokeCircle(x, y, 7);
    }
  }

  // ---------------------------------------------------------------------------
  // Fleets: owner texture per variant, four frames registered, 36/route and the
  // global 1000-sprite ceiling are unchanged. Routes become dashed daylight lines.
  // ---------------------------------------------------------------------------
  private renderFleets() {
    const w = this.sim!.world;
    const alive = new Set(w.fleets.map(f => f.id));
    for (const [id, list] of this.bugs) if (!alive.has(id)) { list.forEach(s => s.destroy()); this.bugs.delete(id); }
    let total = 0;
    // Draw each visual route once per frame: pressure fixtures can queue dozens of
    // fleets on the same lane, but the path only needs one pair of dashed layers.
    const routes = new Set<string>();
    for (const f of w.fleets) {
      const source = w.colonies.find(c => c.id === f.from)!;
      const target = w.colonies.find(c => c.id === f.to)!;
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const count = Math.min(UNIT_BATCH, Math.ceil(f.count), Math.max(0, UNIT_CAP - total));
      total += count;
      let sprites = this.bugs.get(f.id);
      if (!sprites) { sprites = []; this.bugs.set(f.id, sprites); }
      while (sprites.length < count) sprites.push(this.add.sprite(f.x, f.y, this.unitTexture(f.race, f.owner), 0).setDepth(9));
      while (sprites.length > count) sprites.pop()!.destroy();
      const routeKey = `${f.owner}|${f.from}|${f.to}`;
      if (!routes.has(routeKey)) {
        routes.add(routeKey);
        this.dashedLine(this.ground, source.x, source.y, target.x, target.y, HALO, .3, 4, 16, 12);
        this.dashedLine(this.ground, source.x, source.y, target.x, target.y, this.ownerColor(f.owner), .42, 1.7, 16, 12);
      }
      const traveled = Math.hypot(f.x - source.x, f.y - source.y);
      const scale = UNIT_SCALE[f.race];
      sprites.forEach((s, i) => {
        const row = Math.floor(i / 4);
        const side = (i % 4 - 1.5) * 8 + (f.id % 7 - 3) * 4;
        const trail = Math.min(Math.max(0, traveled - 18), row * 9 + (f.id % 5) * 3);
        const wave = this.reducedMotion ? 0 : Math.sin(this.clock * 19 + i) * 1.4;
        const x = f.x - Math.cos(angle) * trail - Math.sin(angle) * (side + wave);
        const y = f.y - Math.sin(angle) * trail + Math.cos(angle) * (side + wave);
        s.setPosition(x, y).setRotation(angle + Math.PI / 2).setFrame(Math.floor(this.clock * 12 + i) % 4).setScale(scale);
      });
      if (f.count > UNIT_BATCH) {
        const color = this.ownerColor(f.owner);
        this.ground.fillStyle(HALO, .92); this.ground.fillCircle(f.x, f.y, 5.5);
        this.ground.lineStyle(1.5, color, 1); this.ground.strokeCircle(f.x, f.y, 5.5);
        this.ground.fillStyle(color, 1); this.ground.fillCircle(f.x, f.y, 2.1);
      }
    }
    this.visualUnits = total;
  }

  // ---------------------------------------------------------------------------
  // Feedback: pale daylight rings, white spark cores and owner accents instead of
  // the former brass/dark glow.
  // ---------------------------------------------------------------------------
  private renderEffects(dt: number) {
    const g = this.top;
    this.fx = this.fx.filter(f => f.age < f.life);
    for (const f of this.fx) {
      f.age += dt;
      const p = Math.min(1, f.age / f.life), a = 1 - p, e = f.event, color = this.ownerColor(e.owner);
      if (e.type === 'shot') {
        const tx = e.targetX ?? e.x, ty = e.targetY ?? e.y;
        const travel = Math.min(1, p * 2.5);
        const px = e.x + (tx - e.x) * travel, py = e.y - 20 + (ty - e.y + 20) * travel;
        if (travel < 1) {
          const tailX = e.x + (px - e.x) * .62, tailY = e.y - 20 + (py - e.y + 20) * .62;
          g.lineStyle(4.6, HALO, a * .45); g.lineBetween(tailX, tailY, px, py);
          g.lineStyle(2, BALLISTIC, a * .9); g.lineBetween((tailX + px) / 2, (tailY + py) / 2, px, py);
          g.fillStyle(SPARK, a * .85); g.fillCircle(px, py, 4.2);
          g.fillStyle(0xffffff, a); g.fillCircle(px, py, 2);
        } else {
          g.lineStyle(4, HALO, a * .4); g.strokeCircle(tx, ty, 4 + p * 9);
          g.lineStyle(1.8, BALLISTIC, a * .8); g.strokeCircle(tx, ty, 2 + p * 8);
          for (let i = 0; i < (this.reducedMotion ? 3 : 5); i++) {
            const angle = i * 1.6 + p, radius = 3 + p * 14;
            g.fillStyle(i % 2 ? 0xffffff : SPARK, a * .85);
            g.fillCircle(tx + Math.cos(angle) * radius, ty + Math.sin(angle) * radius * .8, 1.4);
          }
        }
      } else if (e.type === 'skill') {
        const radius = BATTLE_RULES.skillRadius * Math.min(1, p * 2.8);
        g.fillStyle(MINT, a * .16); g.fillCircle(e.x, e.y, radius);
        g.lineStyle(6, HALO, a * .32); g.strokeCircle(e.x, e.y, radius + 1);
        g.lineStyle(2.2, ROUTE, a * .8); g.strokeCircle(e.x, e.y, radius);
        if (radius > 14) this.dashedCircle(g, e.x, e.y, radius - 9, MINT, a * .6, 1.5, 9, 7, p);
        for (let i = 0; i < (this.reducedMotion ? 8 : 22); i++) {
          const theta = i * 2.399 + p * 3;
          const r = 18 + ((i * 17 + p * 90) % 110);
          const x = e.x + Math.cos(theta) * r, y = e.y + Math.sin(theta) * r;
          const len = 6 + (i % 3) * 2;
          g.lineStyle(1.2, i % 3 ? 0xffffff : 0xe7f4d8, a * .45);
          g.lineBetween(x, y, x - Math.cos(theta + .45) * len, y - Math.sin(theta + .45) * len);
          g.fillStyle(i % 3 ? 0xffffff : SPARK, a * .9); g.fillCircle(x, y, 1.1);
        }
      } else if (e.type === 'capture') {
        g.lineStyle(4.5, HALO, a * .55); g.strokeEllipse(e.x, e.y + 18, 106 + p * 50, 64 + p * 32);
        g.lineStyle(2.2, color, a * .9); g.strokeEllipse(e.x, e.y + 18, 106 + p * 50, 64 + p * 32);
        for (let i = 0; i < (this.reducedMotion ? 4 : 12); i++) {
          const angle = i * 2.399, r = 16 + (i % 3) * 13;
          const x = e.x + Math.cos(angle) * r, y = e.y + 14 + Math.sin(angle) * r * .4 - p * (30 + i % 4 * 10);
          g.fillStyle(i % 3 ? 0xffffff : SPARK, a * .85); g.fillEllipse(x, y, 2, 4);
        }
      } else {
        g.lineStyle(4, HALO, a * .4); g.strokeEllipse(e.x, e.y + 14, 40 + p * 45, 22 + p * 26);
        g.lineStyle(1.8, color, a * .65); g.strokeEllipse(e.x, e.y + 14, 40 + p * 45, 22 + p * 26);
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI / 2 + .7;
          g.fillStyle(i % 2 ? 0xffffff : SPARK, a * .8);
          g.fillCircle(e.x + Math.cos(angle) * (13 + p * 19), e.y + Math.sin(angle) * (10 + p * 15), 1.6 * a);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Roads: a static warm-earth bed for the whole level plus a per-frame blue
  // overlay for the direct neighbours of the current sources. Both layers sit
  // under buildings and number plates, so lanes never paint over the art. The
  // geometry is straight because fleets travel in a straight line along the same
  // logical edge; highlighting only ever reuses a real road segment and never
  // invents a line between non-adjacent colonies.
  // ---------------------------------------------------------------------------
  private drawRoadBase() {
    const g = this.roadBase;
    g.clear();
    for (const s of this.roadLanes) {
      g.lineStyle(18, ROAD_SHADE, .13); g.lineBetween(s.x1, s.y1, s.x2, s.y2);
      g.lineStyle(14, ROAD_RIM, .58); g.lineBetween(s.x1, s.y1, s.x2, s.y2);
      g.lineStyle(9, ROAD_SAND, .8); g.lineBetween(s.x1, s.y1, s.x2, s.y2);
      g.lineStyle(5, ROAD_LIGHT, .5); g.lineBetween(s.x1, s.y1, s.x2, s.y2);
      g.fillStyle(ROAD_SAND, .8);
      g.fillCircle(s.x1, s.y1, 4.5); g.fillCircle(s.x2, s.y2, 4.5);
      this.dashedLine(g, s.x1, s.y1, s.x2, s.y2, ROAD_DOT, .5, 1.5, 10, 10);
    }
  }

  private renderRoadSelection() {
    if (!this.sim || this.skillArmed) return;
    const sources = this.previewSources();
    if (!sources.size) return;
    const preview = roadPreview(this.sim.world.roads, this.roadLanes, sources);
    const phase = this.paused || this.reducedMotion ? 0 : this.clock * 16;
    for (const s of preview.segments) this.drawRoadHighlight(this.roadHi, s, .55, phase);
    for (const id of preview.targets) {
      if (sources.has(id)) continue;
      const c = this.sim.world.colonies.find((colony) => colony.id === id);
      if (c) this.drawTargetRing(c, false);
    }
  }

  private drawRoadHighlight(g: Phaser.GameObjects.Graphics, s: RoadSegment, alpha: number, phase: number) {
    g.lineStyle(19, ROUTE, .16); g.lineBetween(s.x1, s.y1, s.x2, s.y2);
    g.lineStyle(15, HALO, .72); g.lineBetween(s.x1, s.y1, s.x2, s.y2);
    g.lineStyle(9, ROUTE, alpha); g.lineBetween(s.x1, s.y1, s.x2, s.y2);
    this.dashedLine(g, s.x1, s.y1, s.x2, s.y2, 0xffffff, .92, 2.4, 14, 10, phase);
  }

  /** Blue halo for a legal destination, drawn under the building like other floor marks. */
  private drawTargetRing(c: Colony, strong: boolean) {
    const g = this.ground, cy = c.y + 18;
    g.lineStyle(strong ? 7 : 5, HALO, strong ? .55 : .32);
    g.strokeEllipse(c.x, cy, 176, 120);
    g.lineStyle(strong ? 2.8 : 1.7, SELECT, strong ? 1 : .7);
    g.strokeEllipse(c.x, cy, 176, 120);
    if (!strong) return;
    g.lineStyle(2.4, SELECT, 1);
    for (const sx of [-1, 1]) g.lineBetween(c.x + sx * 88, cy - 6, c.x + sx * 88, cy + 6);
    g.lineBetween(c.x - 6, cy - 60, c.x + 6, cy - 60);
    g.lineBetween(c.x - 6, cy + 60, c.x + 6, cy + 60);
  }

  // ---------------------------------------------------------------------------
  // Pointer feedback: selection is drawn outside the building footprint, the
  // hovered legal lane is emphasised, and cannon range appears only on selection.
  // ---------------------------------------------------------------------------
  private renderInput() {
    const g = this.top, p = this.input.activePointer;
    if (this.paused) return;
    if (this.skillArmed) {
      this.game.canvas.style.cursor = 'crosshair';
      g.fillStyle(0x7fc8c0, .14); g.fillCircle(p.x, p.y, BATTLE_RULES.skillRadius);
      g.lineStyle(5, HALO, .42); g.strokeCircle(p.x, p.y, BATTLE_RULES.skillRadius);
      g.lineStyle(2, ROUTE, .9); g.strokeCircle(p.x, p.y, BATTLE_RULES.skillRadius);
      g.lineStyle(1.2, MINT, .7); g.strokeCircle(p.x, p.y, 22);
      g.fillStyle(0xffffff, .9); g.fillCircle(p.x, p.y, 3);
      return;
    }
    const hover = this.hit(p.x, p.y);
    const sources = this.previewSources();
    const preview = sources.size
      ? roadPreview(this.sim!.world.roads, this.roadLanes, sources, hover?.id ?? null)
      : null;
    const legal = !!hover && !!preview?.targets.has(hover.id);
    const isSource = !!hover && sources.has(hover.id);
    const dragging = !!this.drag?.active && !!this.drag.source;
    // A non-adjacent enemy is blocked on click and drag; a non-adjacent friendly
    // nest stays a valid reselect on click, but is blocked during an explicit drag.
    const blocked = !!hover && !!preview && !isSource && !legal && (dragging || hover.owner !== 1);
    this.game.canvas.style.cursor = !hover ? 'default' : blocked ? 'not-allowed' : 'pointer';
    if (preview) {
      const phase = this.reducedMotion ? 0 : this.clock * 16;
      for (const s of preview.hoverSegments) this.drawRoadHighlight(this.roadHi, s, 1, phase);
    }
    if (hover && !this.selected.has(hover.id)) {
      if (legal) this.drawTargetRing(hover, true);
      else if (blocked) {
        this.dashedCircle(this.ground, hover.x, hover.y + 12, 86, HALO, .4, 3.5, 12, 9);
        this.dashedCircle(this.ground, hover.x, hover.y + 12, 86, 0x8c7b64, .85, 1.6, 12, 9);
      } else {
        const color = this.ownerColor(hover.owner);
        this.ground.lineStyle(6, HALO, .4); this.ground.strokeEllipse(hover.x, hover.y + 20, 158, 100);
        this.ground.lineStyle(2, color, .8); this.ground.strokeEllipse(hover.x, hover.y + 20, 158, 100);
      }
    }
    if (this.drag?.active && !this.drag.source) {
      const x = Math.min(this.drag.x, p.x), y = Math.min(this.drag.y, p.y);
      const w = Math.abs(p.x - this.drag.x), h = Math.abs(p.y - this.drag.y);
      g.fillStyle(0x9fd0ea, .10); g.fillRect(x, y, w, h);
      g.lineStyle(4, HALO, .65); g.strokeRect(x, y, w, h);
      this.dashedLine(g, x, y, x + w, y, ROUTE, .95, 2, 10, 7);
      this.dashedLine(g, x + w, y, x + w, y + h, ROUTE, .95, 2, 10, 7);
      this.dashedLine(g, x + w, y + h, x, y + h, ROUTE, .95, 2, 10, 7);
      this.dashedLine(g, x, y + h, x, y, ROUTE, .95, 2, 10, 7);
    }
  }

  private brackets(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, color: number, alpha: number, width: number) {
    const arm = 20;
    g.lineStyle(width, color, alpha);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const x = cx + sx * rx, y = cy + sy * ry;
      g.lineBetween(x, y, x - sx * arm, y);
      g.lineBetween(x, y, x, y - sy * arm);
    }
  }

  private dashedLine(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, width: number, dash = 14, gap = 9, phase = 0) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len, uy = dy / len;
    const period = dash + gap;
    const offset = period > 0 ? ((phase % period) + period) % period : 0;
    g.lineStyle(width, color, alpha);
    for (let d = -offset; d < len; d += period) {
      const start = Math.max(0, d), end = Math.min(d + dash, len);
      if (end > start) g.lineBetween(x1 + ux * start, y1 + uy * start, x1 + ux * end, y1 + uy * end);
    }
  }

  private dashedCircle(g: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number, color: number, alpha: number, width: number, dash = 11, gap = 8, phase = 0) {
    if (radius <= 0) return;
    g.lineStyle(width, color, alpha);
    const count = Math.max(8, Math.round((Math.PI * 2 * radius) / (dash + gap)));
    const step = (Math.PI * 2) / count;
    const arc = step * (dash / (dash + gap));
    for (let i = 0; i < count; i++) {
      const start = i * step + phase;
      g.beginPath(); g.arc(cx, cy, radius, start, start + arc); g.strokePath();
    }
  }

  /** Slow daylight motes; fully disabled by the existing reduced-motion setting. */
  private ambient() {
    if (this.reducedMotion) return;
    const g = this.top;
    const count = this.level?.biome === 'marsh' ? 22 : 14;
    for (let i = 0; i < count; i++) {
      const x = (i * 177 + Math.sin(this.clock * .13 + i) * 23) % 1550 + 25;
      const y = 185 + (i * 87) % 560 + Math.sin(this.clock * .24 + i * 2) * 15;
      const alpha = .12 + Math.sin(this.clock * .7 + i) * .08;
      g.fillStyle(0xffffff, alpha * .3); g.fillCircle(x, y, 4);
      g.fillStyle(i % 3 ? SPARK : 0xdff0d2, alpha); g.fillCircle(x, y, .9 + i % 2 * .35);
    }
  }
}

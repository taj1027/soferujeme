// Ostrov Shooter (MVP) — Phaser 3
// NOVÝ prístup: BULLETS bez fyziky (ručný pohyb) => 100% budú lietať.
// - Multi-touch
// - Player môže po vode, zombie nie
// - Voda neblokuje náboje
// - Stromy blokujú náboje (tile check)
// - Zásah zombie = AABB hitbox

const TILE = 22;
const MAP_W = 29;
const MAP_H = 35;
const VIEW_W = 390;
const VIEW_H = 780;

const COLORS = {
  bg: 0x0f0f10,
  grass: 0x4aa34a,
  sand: 0xd9c47c,
  water: 0x3b6eea,
  tree: 0x1e6b2e,
  trunk: 0x8b5a2b,
  player: 0xffffff,
  enemy: 0x7cff70,
  red: 0xff3b30,
  bullet: 0xffd800,
  mine: 0xff7a00
};

const WEAPONS = [
  { id:"pistol",  name:"Pištoľ",     desc:"Stredná rýchlosť, presná", fireRateMs: 260, bullets:1, spreadDeg:2,  speed:620, damage:22 },
  { id:"shotgun", name:"Brokovnica", desc:"Pomaly, ale veľa peliet",  fireRateMs: 700, bullets:6, spreadDeg:18, speed:560, damage:12 },
  { id:"smg",     name:"Samopal",    desc:"Rýchlo, menej presné",     fireRateMs: 120, bullets:1, spreadDeg:10, speed:650, damage:15 },
  { id:"mine",    name:"Míny",       desc:"Mina zostane ležať a zabije zombie pri priblížení", fireRateMs: 420, bullets:1, spreadDeg:0, speed:0, damage:999, mine:true }
];

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function degToRad(d){ return d * Math.PI / 180; }
function randChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function isFiniteNum(x){ return Number.isFinite(x) && !Number.isNaN(x); }

// AABB overlap (axis-aligned bounding boxes)
function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh){
  return Math.abs(ax - bx) * 2 < (aw + bw) && Math.abs(ay - by) * 2 < (ah + bh);
}

class MainScene extends Phaser.Scene {
  constructor(){ super("main"); }

  init(){
    this.state = "menu";
    this.weaponIndex = 0;
    this.weapon = WEAPONS[this.weaponIndex];

    this.hpMax = 100;
    this.hp = this.hpMax;
    this.score = 0;
    this.wave = 1;

    this.fireCooldown = 0;

    this.lastAim = new Phaser.Math.Vector2(1, 0);

    this.touch = {
      left:  { active:false, id:null, basePos:null, vec:new Phaser.Math.Vector2(0,0) },
      right: { active:false, id:null, basePos:null, vec:new Phaser.Math.Vector2(0,0) },
      firing:false
    };

    this._tmp = new Phaser.Math.Vector2();
    this._aim = new Phaser.Math.Vector2(1,0);

    // Manual bullets list
    this.bullets = [];
    this.MAX_BULLETS = 220;
  }

  create(){
    const w = this.scale.width;
    const h = this.scale.height;

    this.input.addPointer(2);

    this.add.rectangle(w/2, h/2, w, h, COLORS.bg);

    // textures
    this.makeSolidTexture("tex_player", COLORS.player, 14, 14);
    this.makeSolidTexture("tex_enemy",  COLORS.enemy,  14, 14);
    this.makeSolidTexture("tex_bullet", COLORS.bullet,  6,  6);
    this.makeSolidTexture("tex_mine",   COLORS.mine,   10, 10);

    this.worldW = MAP_W * TILE;
    this.worldH = MAP_H * TILE;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.treeBlocks  = this.physics.add.staticGroup(); // blocks player & enemies
    this.waterBlocks = this.physics.add.staticGroup(); // blocks enemies only

    this.spawnLand = [];
    this.playerLand = [];

    this.generateIslandMap();
    this.renderMap();

    // player (Arcade)
    this.player = this.physics.add.sprite(0, 0, "tex_player");
    this.player.setCollideWorldBounds(true);
    this.player.setDrag(700, 700);
    this.player.setMaxVelocity(240, 240);
    this.player.body.setSize(14, 14, true);

    // aim line
    this.aimLine = this.add.line(0,0, 0,0, 0, -24, COLORS.bullet, 0.9).setOrigin(0.5);

    // enemies (Arcade)
    this.enemies = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite });

    // collisions
    this.physics.add.collider(this.player, this.treeBlocks);
    this.physics.add.collider(this.enemies, this.treeBlocks);
//    this.physics.add.collider(this.enemies, this.waterBlocks); // zombie blocked by water

    // enemy touch player
    this.physics.add.overlap(this.player, this.enemies, (p, e)=>{
      if (!e?.active) return;
      if (!e.hitCd || e.hitCd <= 0){
        e.hitCd = 650;
        this.takeDamage(10);
      }
    });

    // UI
    this.uiHP     = this.add.text(10, 10,  "HP: 100", { fontSize:"16px", color:"#fff" }).setScrollFactor(0).setDepth(150);
    this.uiScore  = this.add.text(10, 32,  "Skóre: 0", { fontSize:"16px", color:"#fff" }).setScrollFactor(0).setDepth(150);
    this.uiWave   = this.add.text(10, 54,  "Vlna: 1",  { fontSize:"16px", color:"#fff" }).setScrollFactor(0).setDepth(150);
    this.uiWeapon = this.add.text(10, 76,  "Zbraň: -", { fontSize:"16px", color:"#fff" }).setScrollFactor(0).setDepth(150);
    this.uiHint   = this.add.text(10, 100, "Strieľanie: pravý joystick potiahni smerom", { fontSize:"14px", color:"#cfcfcf" }).setScrollFactor(0).setDepth(150);
    this.uiInfo   = this.add.text(10, 124, "", { fontSize:"14px", color:"#cfcfcf" }).setScrollFactor(0).setDepth(150);

    // Menu + joysticks
    this.buildMenu();
    this.createJoysticks();

    // input
    this.input.on("pointerdown", (p)=> this.onPointerDown(p));
    this.input.on("pointerup",   (p)=> this.onPointerUp(p));
    this.input.on("pointermove", (p)=> this.onPointerMove(p));

    this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT");

    this.cameras.main.stopFollow();
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;

    this.refreshMenuWeapon();
    this.setState("menu");
  }

  makeSolidTexture(key, color, w, h){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  // SAFE aim (never NaN)
  getSafeAim(out){
    const v = this.touch.right.vec;
    if (this.touch.right.active && v && v.length() > 0.20){
      out.copy(v);
      const len = out.length();
      if (len > 0.0001) out.scale(1/len);
      else out.copy(this.lastAim);

      if (isFiniteNum(out.x) && isFiniteNum(out.y)) this.lastAim.copy(out);
      return out;
    }

    out.copy(this.lastAim);
    if (!isFiniteNum(out.x) || !isFiniteNum(out.y) || out.length() < 0.0001){
      out.set(1,0);
      this.lastAim.set(1,0);
    }
    return out;
  }

  buildMenu(){
    const w = this.scale.width;
    const h = this.scale.height;

    this.menu = this.add.container(0,0).setScrollFactor(0);

    const panel = this.add.rectangle(w/2, h/2, w*0.92, h*0.56, 0x000000, 0.65).setStrokeStyle(2, 0x444444);
    const title = this.add.text(w/2, h/2 - 160, "Vyber zbraň", { fontSize:"24px", color:"#fff" }).setOrigin(0.5);

    this.menuWeaponName = this.add.text(w/2, h/2 - 90, "", { fontSize:"22px", color:"#fff" }).setOrigin(0.5);
    this.menuWeaponDesc = this.add.text(w/2, h/2 - 55, "", { fontSize:"14px", color:"#cfcfcf", align:"center" }).setOrigin(0.5);

    const btnPrev = this.add.rectangle(w/2 - 120, h/2, 90, 54, 0x1c1c1c, 0.95).setStrokeStyle(2, 0x555555).setInteractive();
    const btnNext = this.add.rectangle(w/2 + 120, h/2, 90, 54, 0x1c1c1c, 0.95).setStrokeStyle(2, 0x555555).setInteractive();
    const prevTxt = this.add.text(w/2 - 120, h/2, "◀", { fontSize:"26px", color:"#fff" }).setOrigin(0.5);
    const nextTxt = this.add.text(w/2 + 120, h/2, "▶", { fontSize:"26px", color:"#fff" }).setOrigin(0.5);

    const btnStart = this.add.rectangle(w/2, h/2 + 110, 240, 66, 0x2bdc4a, 0.95).setStrokeStyle(2, 0x0f6b22).setInteractive();
    const startTxt = this.add.text(w/2, h/2 + 110, "ŠTART", { fontSize:"22px", color:"#111" }).setOrigin(0.5);

    this.menu.add([panel, title, this.menuWeaponName, this.menuWeaponDesc, btnPrev, btnNext, prevTxt, nextTxt, btnStart, startTxt]);
    this.menu.list.forEach(o => o.setScrollFactor(0).setDepth(200));

    btnPrev.on("pointerdown", ()=>{ this.weaponIndex = (this.weaponIndex - 1 + WEAPONS.length) % WEAPONS.length; this.refreshMenuWeapon(); });
    btnNext.on("pointerdown", ()=>{ this.weaponIndex = (this.weaponIndex + 1) % WEAPONS.length; this.refreshMenuWeapon(); });
    btnStart.on("pointerdown", ()=> this.startGame());
  }

  setState(s){
    this.state = s;
    const isMenu = (s === "menu");
    const isPlaying = (s === "playing");

    this.menu.setVisible(isMenu);

    this.joyLeft.base.setVisible(isPlaying);
    this.joyLeft.knob.setVisible(isPlaying);
    this.joyRight.base.setVisible(isPlaying);
    this.joyRight.knob.setVisible(isPlaying);

    if (isMenu){
      this.cameras.main.stopFollow();
      this.cameras.main.scrollX = 0;
      this.cameras.main.scrollY = 0;
      this.resetRun(true);
    }
  }

  refreshMenuWeapon(){
    const ww = WEAPONS[this.weaponIndex];
    this.menuWeaponName.setText(ww.name);
    this.menuWeaponDesc.setText(ww.desc);
  }

  updateUI(){
    this.uiHP.setText(`HP: ${this.hp}`);
    this.uiScore.setText(`Skóre: ${this.score}`);
    this.uiWave.setText(`Vlna: ${this.wave}`);
    this.uiWeapon.setText(`Zbraň: ${this.weapon.name}`);
  }

  resetRun(placeOnly=false){
    this.hp = this.hpMax;
    this.score = 0;
    this.wave = 1;
    this.fireCooldown = 0;
    this.lastAim.set(1, 0);

    this.touch.left.active = false;
    this.touch.right.active = false;
    this.touch.firing = false;
    this.touch.left.id = null;
    this.touch.right.id = null;
    this.touch.left.basePos = null;
    this.touch.right.basePos = null;
    this.touch.left.vec.set(0,0);
    this.touch.right.vec.set(0,0);

    this.enemies.clear(true, true);

    // clear manual bullets
    this.bullets.forEach(b => b.go?.destroy?.());
    this.bullets.length = 0;

    const p = randChoice(this.playerLand.length ? this.playerLand : this.spawnLand);
    this.player.setPosition(p.x, p.y);
    this.player.body.setVelocity(0,0);

    if (!placeOnly) this.spawnWave(this.wave);

    this.updateUI();
    this.uiInfo.setText("");
  }

  startGame(){
    this.weapon = WEAPONS[this.weaponIndex];
    this.uiWeapon.setText(`Zbraň: ${this.weapon.name}`);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.setState("playing");
    this.resetRun(false);
    this.uiInfo.setText("Preži a vyčisti vlnu!");
  }

  takeDamage(dmg){
    this.hp = clamp(this.hp - dmg, 0, this.hpMax);
    this.uiInfo.setText(`-${dmg} HP`);
    if (this.hp <= 0){
      this.uiInfo.setText(`💀 Koniec! Skóre: ${this.score}. Vyber zbraň a ŠTART.`);
      this.setState("menu");
    }
  }

  spawnWave(wave){
    const count = Math.min(3 + wave, 10);
    for (let i=0;i<count;i++){
      const pos = randChoice(this.spawnLand);

      const e = this.physics.add.sprite(pos.x, pos.y, "tex_enemy");
      e.body.setSize(14, 14, true);

      e.baseSpeed = 55 + wave * 4;
      e.setDrag(300, 300);
      e.setMaxVelocity(110 + wave*5, 110 + wave*5);

      e.hp = 35 + wave * 8;
      e.hitCd = 0;
      e.flash = 0;

      this.enemies.add(e);
    }
    this.uiInfo.setText(`Vlna ${wave} (zombie: ${count})`);
  }

  // Manual bullet / mine spawn (NO physics)
  tryFire(){
    if (this.fireCooldown > 0) return;
    this.fireCooldown = this.weapon.fireRateMs;

    const aim = this.getSafeAim(this._aim);
    const baseAngle = Math.atan2(aim.y, aim.x);

    const bullets = this.weapon.bullets;
    const spread = this.weapon.spreadDeg;

    for (let i=0;i<bullets;i++){
      if (this.bullets.length >= this.MAX_BULLETS){
        const old = this.bullets.shift();
        old?.go?.destroy?.();
      }

      const off = (bullets === 1) ? 0 : Phaser.Math.Linear(-spread/2, spread/2, i/(bullets-1));
      const ang = baseAngle + degToRad(off + Phaser.Math.Between(-spread/6, spread/6));

      const isMine = !!this.weapon.mine;
      const sp = isMine ? 0 : this.weapon.speed;
      let vx = Math.cos(ang) * sp;
      let vy = Math.sin(ang) * sp;

      if (!isFiniteNum(vx) || !isFiniteNum(vy)){
        vx = sp; vy = 0;
      }

      const spawnDist = isMine ? 22 : 18;
      const sx = this.player.x + Math.cos(ang) * spawnDist;
      const sy = this.player.y + Math.sin(ang) * spawnDist;

      // render as sprite (no physics body)
      const go = this.add.sprite(sx, sy, isMine ? "tex_mine" : "tex_bullet");

      this.bullets.push({
        go,
        kind: isMine ? "mine" : "bullet",
        x: sx, y: sy,
        vx, vy,
        life: 0.95, // seconds
        damage: this.weapon.damage,
        w: isMine ? 10 : 6,
        h: isMine ? 10 : 6,
        triggerRadius: isMine ? 18 : 0
      });
    }
  }

  // tile check for tree (code 3), water/lake do not block bullets
  isTreeAtWorld(x, y){
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true; // outside = kill bullet
    return this.map[ty][tx] === 3;
  }

  update(_, deltaMs){
    if (this.state !== "playing") return;

    const dt = deltaMs / 1000;

    this.fireCooldown = Math.max(0, this.fireCooldown - deltaMs);

    // enemies chase + flash
    this.enemies.getChildren().forEach(e=>{
      if (!e?.active || !e.body) return;
      if (e.hitCd > 0) e.hitCd -= deltaMs;

      if (e.flash > 0){
        e.flash -= deltaMs;
        e.setTint(COLORS.red);
      } else {
        e.clearTint();
      }

      const dx = this.player.x - e.x;
      const dy = this.player.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const sp = e.baseSpeed || 60;
      e.body.setVelocity((dx/len)*sp, (dy/len)*sp);
    });

    if (this.enemies.countActive(true) === 0){
      this.wave += 1;
      this.spawnWave(this.wave);
    }

    // player movement
    const mv = this._tmp;
    mv.set(0,0);

    if (this.touch.left.active) mv.copy(this.touch.left.vec);

    const up = this.keys.W.isDown || this.keys.UP.isDown;
    const down = this.keys.S.isDown || this.keys.DOWN.isDown;
    const left = this.keys.A.isDown || this.keys.LEFT.isDown;
    const right = this.keys.D.isDown || this.keys.RIGHT.isDown;
    if (up) mv.y -= 1;
    if (down) mv.y += 1;
    if (left) mv.x -= 1;
    if (right) mv.x += 1;

    if (mv.length() > 0.05) mv.normalize();
    this.player.body.setVelocity(mv.x * 200, mv.y * 200);

    // aim visual
    const aim = this.getSafeAim(this._aim);
    const ang = Math.atan2(aim.y, aim.x);
    this.aimLine.setPosition(this.player.x, this.player.y);
    this.aimLine.rotation = ang + Math.PI/2;

    // fire
    if (this.touch.right.active && this.touch.firing){
      this.tryFire();
    }

    // ---- Manual bullets update + collisions ----
    // Player/enemy sizes for hitboxes
    const enemyW = 14, enemyH = 14;

    for (let i = this.bullets.length - 1; i >= 0; i--){
      const b = this.bullets[i];
      b.life -= dt;

      // move bullets, mines stay on ground
      if (b.kind !== "mine"){
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
      b.go.x = b.x;
      b.go.y = b.y;

      // kill if expired
      if (b.life <= 0){
        b.go.destroy();
        this.bullets.splice(i, 1);
        continue;
      }

      // kill if hits tree (water ignored)
      if (this.isTreeAtWorld(b.x, b.y)){
        b.go.destroy();
        this.bullets.splice(i, 1);
        continue;
      }

      // hit enemies
      let hit = false;
      this.enemies.getChildren().forEach(e=>{
        if (hit || !e?.active) return;

        if (b.kind === "mine"){
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          if ((dx*dx + dy*dy) <= (b.triggerRadius * b.triggerRadius)){
            e.hp = 0;
            e.flash = 90;
            hit = true;
            e.destroy();
            this.score += 10;
            this.uiInfo.setText(`💥 Mina +10`);
          }
          return;
        }

        if (aabbOverlap(b.x, b.y, b.w, b.h, e.x, e.y, enemyW, enemyH)){
          e.hp -= b.damage;
          e.flash = 90;
          hit = true;
          if (e.hp <= 0){
            e.destroy();
            this.score += 10;
            this.uiInfo.setText(`+10`);
          }
        }
      });

      if (hit){
        b.go.destroy();
        this.bullets.splice(i, 1);
        continue;
      }

      // kill if outside world (safety)
      if (b.x < 0 || b.y < 0 || b.x > this.worldW || b.y > this.worldH){
        b.go.destroy();
        this.bullets.splice(i, 1);
        continue;
      }
    }

    this.updateUI();
  }

  // -------- Joysticks --------
  createJoysticks(){
    const w = this.scale.width;
    const h = this.scale.height;

    this.joyLeft = {
      base: this.add.circle(90, h-130, 56, 0x000000, 0.30).setScrollFactor(0).setDepth(120).setVisible(false),
      knob: this.add.circle(90, h-130, 24, 0xffffff, 0.20).setScrollFactor(0).setDepth(121).setVisible(false)
    };

    this.joyRight = {
      base: this.add.circle(w-90, h-130, 56, 0x000000, 0.30).setScrollFactor(0).setDepth(120).setVisible(false),
      knob: this.add.circle(w-90, h-130, 24, 0xffd800, 0.22).setScrollFactor(0).setDepth(121).setVisible(false)
    };
  }

  onPointerDown(p){
    if (this.state !== "playing") return;
    const isLeftSide = p.x < this.scale.width/2;

    if (isLeftSide && !this.touch.left.active){
      this.touch.left.active = true;
      this.touch.left.id = p.id;
      this.touch.left.basePos = { x: 90, y: this.scale.height-130 };
      this.touch.left.vec.set(0,0);
      this.joyLeft.base.setPosition(this.touch.left.basePos.x, this.touch.left.basePos.y);
      this.joyLeft.knob.setPosition(this.touch.left.basePos.x, this.touch.left.basePos.y);
    } else if (!isLeftSide && !this.touch.right.active){
      this.touch.right.active = true;
      this.touch.right.id = p.id;
      this.touch.right.basePos = { x: this.scale.width-90, y: this.scale.height-130 };
      this.touch.right.vec.set(0,0);
      this.touch.firing = false;
      this.joyRight.base.setPosition(this.touch.right.basePos.x, this.touch.right.basePos.y);
      this.joyRight.knob.setPosition(this.touch.right.basePos.x, this.touch.right.basePos.y);
    }
  }

  onPointerUp(p){
    if (p.id === this.touch.left.id){
      this.touch.left.active = false;
      this.touch.left.id = null;
      this.touch.left.basePos = null;
      this.touch.left.vec.set(0,0);
      this.joyLeft.knob.setPosition(this.joyLeft.base.x, this.joyLeft.base.y);
    }
    if (p.id === this.touch.right.id){
      this.touch.right.active = false;
      this.touch.right.id = null;
      this.touch.right.basePos = null;
      this.touch.right.vec.set(0,0);
      this.touch.firing = false;
      this.joyRight.knob.setPosition(this.joyRight.base.x, this.joyRight.base.y);
    }
  }

  onPointerMove(p){
    if (this.state !== "playing") return;
    const maxR = 44;

    if (this.touch.left.active && p.id === this.touch.left.id && this.touch.left.basePos){
      const dx = p.x - this.touch.left.basePos.x;
      const dy = p.y - this.touch.left.basePos.y;

      const v = this._tmp;
      v.set(dx, dy);
      const L = v.length();
      if (L > maxR) v.scale(maxR/L);

      this.joyLeft.knob.setPosition(this.touch.left.basePos.x + v.x, this.touch.left.basePos.y + v.y);
      this.touch.left.vec.set(v.x/maxR, v.y/maxR);
      if (this.touch.left.vec.length() > 1) this.touch.left.vec.normalize();
    }

    if (this.touch.right.active && p.id === this.touch.right.id && this.touch.right.basePos){
      const dx = p.x - this.touch.right.basePos.x;
      const dy = p.y - this.touch.right.basePos.y;

      const v = this._tmp;
      v.set(dx, dy);
      const L = v.length();
      if (L > maxR) v.scale(maxR/L);

      this.joyRight.knob.setPosition(this.touch.right.basePos.x + v.x, this.touch.right.basePos.y + v.y);
      this.touch.right.vec.set(v.x/maxR, v.y/maxR);
      if (this.touch.right.vec.length() > 1) this.touch.right.vec.normalize();

      this.touch.firing = (this.touch.right.vec.length() > 0.20);

      // update lastAim only if strong enough
      if (this.touch.right.vec.length() > 0.25){
        const tmp = this._aim;
        tmp.copy(this.touch.right.vec);
        const len = tmp.length();
        if (len > 0.0001) tmp.scale(1/len);
        if (isFiniteNum(tmp.x) && isFiniteNum(tmp.y)) this.lastAim.copy(tmp);
      }
    }
  }

  // -------- Map --------
  generateIslandMap(){
    // 0 sea, 1 sand, 2 grass, 3 tree, 4 lake
    this.map = Array.from({length: MAP_H}, ()=> Array.from({length: MAP_W}, ()=> 0));

    const cx = (MAP_W-1)/2;
    const cy = (MAP_H-1)/2;
    const maxR = Math.min(MAP_W, MAP_H) * 0.44;

    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        const d = Math.hypot(x-cx, y-cy);
        const noise = ((x%3===0)?0.9:1.0) * ((y%4===0)?0.92:1.0);
        const r = maxR * noise;
        if (d < r) this.map[y][x] = 2;
      }
    }

    // sand edge
    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        if (this.map[y][x] !== 2) continue;
        if (this.neighbors4(x,y).some(([nx,ny]) => this.inBounds(nx,ny) && this.map[ny][nx] === 0)){
          this.map[y][x] = 1;
        }
      }
    }

    // lake
    const lakeCx = Math.floor(MAP_W*0.33);
    const lakeCy = Math.floor(MAP_H*0.35);
    const lakeR = 4.2;
    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        if (this.map[y][x] === 0) continue;
        if (Math.hypot(x-lakeCx, y-lakeCy) < lakeR) this.map[y][x] = 4;
      }
    }

    // trees
    const area = [];
    for (let y=Math.floor(MAP_H*0.20); y<Math.floor(MAP_H*0.72); y++){
      for (let x=Math.floor(MAP_W*0.60); x<MAP_W-2; x++){
        if (this.map[y][x] === 2) area.push({x,y});
      }
    }
    for (let i=0;i<Math.floor(area.length*0.16);i++){
      const t = randChoice(area);
      this.map[t.y][t.x] = 3;
    }

    // spawns
    this.spawnLand = [];
    this.playerLand = [];
    for (let y=1;y<MAP_H-1;y++){
      for (let x=1;x<MAP_W-1;x++){
        const c = this.map[y][x];
        if (c !== 1 && c !== 2) continue;

        const n8 = this.neighbors8(x,y).filter(([nx,ny])=>this.inBounds(nx,ny));
        const hasWater = n8.some(([nx,ny]) => this.map[ny][nx] === 0 || this.map[ny][nx] === 4);
        const hasTree  = n8.some(([nx,ny]) => this.map[ny][nx] === 3);

        const px = x*TILE + TILE/2;
        const py = y*TILE + TILE/2;

        if (hasWater && !hasTree) this.spawnLand.push({x:px, y:py});
        if (!hasWater && !hasTree) this.playerLand.push({x:px, y:py});
      }
    }

    if (this.spawnLand.length < 10){
      for (let y=0;y<MAP_H;y++){
        for (let x=0;x<MAP_W;x++){
          if (this.map[y][x] === 2) this.spawnLand.push({x:x*TILE+TILE/2, y:y*TILE+TILE/2});
        }
      }
    }
    if (this.playerLand.length < 10) this.playerLand = this.spawnLand.slice();
  }

  renderMap(){
    this.tiles = this.add.container(0,0);

    for (let y=0;y<MAP_H;y++){
      for (let x=0;x<MAP_W;x++){
        const code = this.map[y][x];
        const px = x*TILE + TILE/2;
        const py = y*TILE + TILE/2;

        let color = COLORS.water;
        if (code === 1) color = COLORS.sand;
        if (code === 2) color = COLORS.grass;
        if (code === 4) color = COLORS.water;
        if (code === 3) color = COLORS.grass;

        this.tiles.add(this.add.rectangle(px, py, TILE, TILE, color));

        if (code !== 0){
          this.tiles.add(this.add.rectangle(px + Phaser.Math.Between(-4,4), py + Phaser.Math.Between(-4,4), 4, 4, 0x000000, 0.08));
        }

        // water blocks ONLY enemies
        if (code === 0 || code === 4){
          const r = this.add.rectangle(px, py, TILE, TILE, 0x000000, 0);
          this.physics.add.existing(r, true);
          this.waterBlocks.add(r);
        }

        // trees block all
        if (code === 3){
          this.tiles.add(this.add.rectangle(px, py+3, TILE*0.25, TILE*0.40, COLORS.trunk));
          this.tiles.add(this.add.rectangle(px, py-3, TILE*0.70, TILE*0.70, COLORS.tree));

          const r = this.add.rectangle(px, py, TILE*0.78, TILE*0.78, 0x000000, 0);
          this.physics.add.existing(r, true);
          this.treeBlocks.add(r);
        }
      }
    }
  }

  neighbors4(x,y){ return [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]; }
  neighbors8(x,y){ return [[x+1,y],[x-1,y],[x,y+1],[x,y-1],[x+1,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1]]; }
  inBounds(x,y){ return x>=0 && y>=0 && x<MAP_W && y<MAP_H; }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "wrap",
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: "#111111",
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [MainScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});

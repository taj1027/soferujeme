
// Šoférujeme 4 — Phaser 3
// Rebuilt from the original controls so the wheel + gas behave like the old version.
// Focus of this version:
// - stable start
// - original steering wheel + gas restored
// - car cards use the same blue as the map (#2E7ED3)
// - finish is always placed on valid driveable land, far from start
// - one-finger pan and two-finger pinch zoom while car is standing still
// - camera snaps back only after gas or steering input

const VIEW_W = 390;
const VIEW_H = 780;
const CELL = 32;

const COLORS = {
  bg: 0x061626,
  panel: 0x061626,
  panelBorder: 0x2E7ED3,
  ocean: 0x2E7ED3,
  land: 0x76C26A,
  card: 0x2E7ED3,
  cardSelected: 0x58A5F3,
  cardBorder: 0x86C0FF,
  text: '#ffffff',
  subtext: '#d8ebff',
};

const CARS = [
  { id:'taxi',    name:'Taxi',    color:0xffd800, maxSpeed:230, accel:520, widthMul:1.0, heightMul:1.0 },
  { id:'motorka', name:'Motorka', color:0xff69b4, maxSpeed:280, accel:560, widthMul:0.55, heightMul:0.85 },
  { id:'auto',    name:'Auto',    color:0xffffff, maxSpeed:240, accel:520, widthMul:1.0, heightMul:1.0 },
];

// Stylized but tighter Slovenia-like grid.
// # = driveable land, S = start land
const MAPS = {
  si: { id:'si', name:'Slovinsko', grid: [
    '..........................',
    '..........................',
    '..........................',
    '...........####...........',
    '.........#########........',
    '.......#############......',
    '......###############.....',
    '.....#################....',
    '....###################...',
    '....####################..',
    '...#####################..',
    '...####################...',
    '....##################....',
    '.....#################....',
    '......###############.....',
    '.......##############.....',
    '........###########.......',
    '.........#########........',
    '..........#####..........',
    '...........###............',
    '............S.............',
    '..........................',
    '..........................',
    '..........................'
  ]}
};

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

class MainScene extends Phaser.Scene {
  constructor(){ super('main'); }

  init(){
    this.state = 'menu';
    this.money = 0;
    this.best = 0;

    this.selectedCarIndex = 0;
    this.selectedCar = CARS[0];
    this.selectedMap = MAPS.si;

    this.steer = 0;
    this.touch = { gas:false };
    this.wheel = { active:false, id:null, cx:92, cy:VIEW_H-92, r:70 };

    this.dragPan = {
      active:false, id:null, startX:0, startY:0, camX:0, camY:0
    };
    this.pinch = {
      active:false, ids:[], startDist:0, startZoom:1, midX:0, midY:0
    };
    this.cameraDetached = false;
    this.starting = false;
  }

  create(){
    document.title = 'Šoférujeme 4';

    this.makeCarTexture();
    this.makeFlagTexture();

    this.add.rectangle(VIEW_W/2, VIEW_H/2, VIEW_W, VIEW_H, COLORS.bg, 1);

    this.buildTopUi();
    this.buildControls();
    this.buildMenu();

    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);

    this.installInputHandlers();
    this.refreshMenuVisuals();
    this.setState('menu');
  }

  buildTopUi(){
    this.uiTitle = this.add.text(VIEW_W/2, 18, 'Šoférujeme 4', {
      fontSize:'18px', fontStyle:'bold', color:COLORS.text
    }).setOrigin(0.5).setScrollFactor(0).setDepth(900);

    this.uiMoney = this.add.text(12, 46, 'Peníze: 0', {
      fontSize:'16px', color:COLORS.text
    }).setScrollFactor(0).setDepth(900);

    this.uiInfo = this.add.text(12, 68, '', {
      fontSize:'13px', color:'#d0e7ff'
    }).setScrollFactor(0).setDepth(900);

    this.debugTxt = this.add.text(12, 88, '', {
      fontSize:'12px', color:'#9fe870'
    }).setScrollFactor(0).setDepth(901);

    this.uiLightBox = this.add.rectangle(VIEW_W-44, 56, 56, 56, 0x0e0e0e).setScrollFactor(0).setDepth(900);
    this.lightDot = this.add.circle(VIEW_W-44, 56, 16, 0x2bdc4a).setScrollFactor(0).setDepth(901);
  }

  buildControls(){
    // Original gas + wheel layout, restored from original file
    this.gasBtn = this.add.rectangle(VIEW_W-90, VIEW_H-80, 110, 110, 0x000000, 0.35)
      .setInteractive().setScrollFactor(0).setDepth(1000);
    this.gasTxt = this.add.text(VIEW_W-90, VIEW_H-80, '⛽', { fontSize:'34px', color:'#fff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x000000, 0.30)
      .setScrollFactor(0).setDepth(1000);
    this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r-10, 0xffffff, 0.06)
      .setScrollFactor(0).setDepth(1001);
    this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r-16), 12, 0xffffff, 0.18)
      .setScrollFactor(0).setDepth(1002);

    this.gasBtn.on('pointerdown', ()=> { if (this.state === 'playing') { this.touch.gas = true; this.resumeCameraFollow(); } });
    this.gasBtn.on('pointerup', ()=> this.touch.gas = false);
    this.gasBtn.on('pointerout', ()=> this.touch.gas = false);
  }

  installInputHandlers(){
    this.cursors = this.input.keyboard.createCursorKeys();

    this.input.on('pointerdown', (p)=>{
      // wheel
      if (this.state === 'playing') {
        const dx = p.x - this.wheel.cx;
        const dy = p.y - this.wheel.cy;
        if (Math.hypot(dx,dy) <= this.wheel.r){
          this.wheel.active = true;
          this.wheel.id = p.id;
          this.resumeCameraFollow();
          this.updateWheelFromPointer(p);
          return;
        }
      }

      // pan / pinch only during playing
      if (this.state !== 'playing') return;

      const active = this.input.manager.pointers.filter(pp => pp.isDown);
      if (active.length >= 2) {
        const [a, b] = active;
        this.beginPinch(a, b);
        return;
      }

      if (!this.touch.gas) {
        this.dragPan.active = true;
        this.dragPan.id = p.id;
        this.dragPan.startX = p.x;
        this.dragPan.startY = p.y;
        this.dragPan.camX = this.cameras.main.scrollX;
        this.dragPan.camY = this.cameras.main.scrollY;
        this.detachCamera();
      }
    });

    this.input.on('pointermove', (p)=>{
      if (this.state !== 'playing') return;

      if (this.wheel.active && p.id === this.wheel.id){
        this.updateWheelFromPointer(p);
        return;
      }

      const active = this.input.manager.pointers.filter(pp => pp.isDown);
      if (active.length >= 2){
        const [a,b] = active;
        this.updatePinch(a,b);
        return;
      }

      if (this.dragPan.active && p.id === this.dragPan.id){
        const cam = this.cameras.main;
        cam.scrollX = this.dragPan.camX - (p.x - this.dragPan.startX) / cam.zoom;
        cam.scrollY = this.dragPan.camY - (p.y - this.dragPan.startY) / cam.zoom;
        this.clampCamera();
      }
    });

    const releaseWheel = ()=>{
      this.wheel.active = false;
      this.wheel.id = null;
      this.steer = 0;
      this.wheelKnob.setPosition(this.wheel.cx, this.wheel.cy - (this.wheel.r-16));
    };

    this.input.on('pointerup', (p)=>{
      if (this.wheel.active && p.id === this.wheel.id) releaseWheel();
      if (this.dragPan.active && p.id === this.dragPan.id){
        this.dragPan.active = false;
        this.dragPan.id = null;
      }
      this.touch.gas = false;

      const active = this.input.manager.pointers.filter(pp => pp.isDown);
      if (active.length < 2){
        this.pinch.active = false;
        this.pinch.ids = [];
      }
    });

    this.input.on('pointerupoutside', ()=>{
      if (this.wheel.active) releaseWheel();
      this.dragPan.active = false;
      this.dragPan.id = null;
      this.touch.gas = false;
      this.pinch.active = false;
      this.pinch.ids = [];
    });
  }

  beginPinch(a, b){
    this.detachCamera();
    this.dragPan.active = false;
    this.pinch.active = true;
    this.pinch.ids = [a.id, b.id];
    this.pinch.startDist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    this.pinch.startZoom = this.cameras.main.zoom;
    this.pinch.midX = (a.x + b.x) / 2;
    this.pinch.midY = (a.y + b.y) / 2;
  }

  updatePinch(a, b){
    if (!this.pinch.active) this.beginPinch(a,b);
    const cam = this.cameras.main;
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) || 1;
    const factor = dist / (this.pinch.startDist || 1);
    cam.zoom = clamp(this.pinch.startZoom * factor, 0.7, 2.2);
    this.clampCamera();
  }

  detachCamera(){
    if (this.cameraDetached || !this.car) return;
    this.cameras.main.stopFollow();
    this.cameraDetached = true;
    this.debug('kamera voľná');
  }

  resumeCameraFollow(){
    if (!this.car) return;
    this.cameras.main.zoom = 1;
    this.cameras.main.startFollow(this.car, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(40, 60);
    this.cameraDetached = false;
  }

  clampCamera(){
    const cam = this.cameras.main;
    const maxX = Math.max(0, this.worldW - VIEW_W / cam.zoom);
    const maxY = Math.max(0, this.worldH - VIEW_H / cam.zoom);
    cam.scrollX = clamp(cam.scrollX, 0, maxX);
    cam.scrollY = clamp(cam.scrollY, 0, maxY);
  }

  updateWheelFromPointer(p){
    const dx = p.x - this.wheel.cx;
    const dy = p.y - this.wheel.cy;
    const r = this.wheel.r - 16;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    this.wheelKnob.setPosition(this.wheel.cx + nx*r, this.wheel.cy + ny*r);
    this.steer = clamp(dx / this.wheel.r, -1, 1);
  }

  // MENU -------------------------------------------------------------------
  buildMenu(){
    const w = VIEW_W, h = VIEW_H;

    this.menuRoot = this.add.container(0, 0);
    const add = obj => { this.menuRoot.add(obj); return obj; };

    add(this.add.rectangle(w/2, h/2+22, w*0.92, h*0.80, COLORS.panel, 0.95)
      .setStrokeStyle(2, COLORS.panelBorder, 1).setScrollFactor(0).setDepth(2000));

    this.menuCarLabel = add(this.add.text(w/2, 150, 'AUTÁ', {
      fontSize:'16px', fontStyle:'bold', color:COLORS.subtext
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001));

    // cards
    this.carCards = [];
    const carY = 250;
    const cardW = 82, cardH = 110;
    const xs = [78, 195, 312];
    CARS.forEach((car, i)=>{
      const cont = this.add.container(xs[i], carY);
      const bg = this.add.rectangle(0, 0, cardW, cardH, COLORS.card, 1)
        .setStrokeStyle(2, COLORS.cardBorder, 0.75).setInteractive({ useHandCursor:true });
      const icon = this.add.image(0, -20, 'tex_car_menu').setTint(car.color);
      if (car.id === 'motorka') icon.setScale(0.32, 0.48);
      else icon.setScale(0.48, 0.48);
      const name = this.add.text(0, 24, car.name, { fontSize:'14px', color:'#ffffff', fontStyle:'bold' }).setOrigin(0.5);
      const speed = this.add.text(0, 44, `max ${car.maxSpeed}`, { fontSize:'11px', color:'#e8f4ff' }).setOrigin(0.5);
      cont.add([bg, icon, name, speed]);
      cont.setScrollFactor(0).setDepth(2002);
      bg.on('pointerdown', ()=> {
        this.selectedCarIndex = i;
        this.selectedCar = CARS[i];
        this.refreshMenuVisuals();
      });
      this.menuRoot.add(cont);
      this.carCards.push({ cont, bg, icon, name, speed });
    });

    this.menuMapLabel = add(this.add.text(w/2, 410, 'MAPY', {
      fontSize:'16px', fontStyle:'bold', color:COLORS.subtext
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2001));

    // map panel
    this.mapPanel = this.add.container(w/2, 525).setScrollFactor(0).setDepth(2002);
    const mapBgOuter = this.add.rectangle(0, 0, 284, 164, COLORS.ocean, 1)
      .setStrokeStyle(2, COLORS.cardBorder, 0.9);
    const clipFrame = this.add.graphics();
    clipFrame.fillStyle(0xffffff, 1);
    clipFrame.fillRoundedRect(-132, -72, 264, 144, 18);
    const mask = clipFrame.createGeometryMask();

    const ocean = this.add.rectangle(0, 0, 264, 144, COLORS.ocean, 1);
    ocean.setMask(mask);

    const europe = this.add.graphics();
    europe.fillStyle(COLORS.land, 1);
    // rough Europe blobs
    europe.fillPoints([
      new Phaser.Geom.Point(-112,-30), new Phaser.Geom.Point(-86,-62), new Phaser.Geom.Point(-44,-58),
      new Phaser.Geom.Point(-16,-38), new Phaser.Geom.Point(24,-40), new Phaser.Geom.Point(60,-52),
      new Phaser.Geom.Point(104,-32), new Phaser.Geom.Point(116,8), new Phaser.Geom.Point(84,28),
      new Phaser.Geom.Point(30,20), new Phaser.Geom.Point(-10,42), new Phaser.Geom.Point(-42,20),
      new Phaser.Geom.Point(-76,30), new Phaser.Geom.Point(-104,10)
    ], true);
    // Iberia/Italy/Balkans touches
    europe.fillPoints([new Phaser.Geom.Point(-88,16), new Phaser.Geom.Point(-68,18), new Phaser.Geom.Point(-58,34), new Phaser.Geom.Point(-76,48), new Phaser.Geom.Point(-94,40)], true);
    europe.fillPoints([new Phaser.Geom.Point(0,28), new Phaser.Geom.Point(10,54), new Phaser.Geom.Point(2,68), new Phaser.Geom.Point(-8,52)], true);
    europe.fillPoints([new Phaser.Geom.Point(22,18), new Phaser.Geom.Point(52,18), new Phaser.Geom.Point(62,40), new Phaser.Geom.Point(30,44)], true);
    europe.setMask(mask);

    const slShape = this.add.graphics();
    slShape.fillStyle(0xdfe96b, 1);
    slShape.lineStyle(2, 0xfff59a, 1);
    // slightly Slovenia-like polygon placed in Balkans area
    const slPts = [
      new Phaser.Geom.Point(10, 26), new Phaser.Geom.Point(28, 22), new Phaser.Geom.Point(42, 28),
      new Phaser.Geom.Point(40, 40), new Phaser.Geom.Point(24, 46), new Phaser.Geom.Point(8, 40)
    ];
    slShape.fillPoints(slPts, true);
    slShape.strokePoints(slPts, true);
    slShape.setMask(mask);

    const slHit = this.add.zone(25, 34, 48, 32).setRectangleDropZone(48, 32).setInteractive({useHandCursor:true});
    slHit.on('pointerdown', ()=>{
      this.selectedMap = MAPS.si;
      this.refreshMenuVisuals();
    });

    const worldTag = this.add.rectangle(-88, -52, 72, 24, 0x234669, 1).setStrokeStyle(1, 0xa4d0ff, 1);
    const worldTxt = this.add.text(-88, -52, '↔ svetadiely', { fontSize:'12px', color:'#ffffff' }).setOrigin(0.5);
    const slTxt = this.add.text(48, 52, 'Slovinsko', { fontSize:'16px', color:'#ffffff', fontStyle:'bold' }).setOrigin(0.5);

    this.mapPanel.add([mapBgOuter, ocean, europe, slShape, slHit, worldTag, worldTxt, slTxt, clipFrame]);
    this.menuRoot.add(this.mapPanel);

    this.selectionText = add(this.add.text(w/2, 630, '', {
      fontSize:'16px', color:'#fff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2002));

    this.btnStart = add(this.add.rectangle(w/2, 705, 212, 58, 0x2bdc4a, 1)
      .setInteractive({ useHandCursor:true }).setScrollFactor(0).setDepth(2002));
    this.btnStartTxt = add(this.add.text(w/2, 705, 'ŠTART', {
      fontSize:'22px', fontStyle:'bold', color:'#111'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2003));
    this.btnStart.on('pointerdown', ()=> this.startGame());
  }

  refreshMenuVisuals(){
    this.carCards.forEach((card, i)=>{
      const selected = i === this.selectedCarIndex;
      card.bg.setFillStyle(selected ? COLORS.cardSelected : COLORS.card, 1);
      card.bg.setStrokeStyle(selected ? 3 : 2, selected ? 0xffffff : COLORS.cardBorder, selected ? 1 : 0.75);
      card.name.setColor('#ffffff');
      card.speed.setColor('#e8f4ff');
    });
    this.selectionText.setText(`Auto: ${this.selectedCar.name}   •   Mapa: ${this.selectedMap.name}`);
  }

  setState(s){
    this.state = s;
    const showMenu = s === 'menu';
    const playing = s === 'playing';
    this.menuRoot.setVisible(showMenu);

    [this.wheelBase, this.wheelRing, this.wheelKnob, this.gasBtn, this.gasTxt].forEach(o=>o.setVisible(playing));
    if (showMenu){
      this.uiInfo.setText('Vyber auto a mapu, potom štart.');
      this.debug('');
      this.lightDot.setFillStyle(0x2bdc4a);
    } else {
      this.lightDot.setFillStyle(0xffcc33);
    }
  }

  debug(msg){
    this.debugTxt.setText(msg || '');
  }

  // WORLD ------------------------------------------------------------------
  clearWorld(){
    if (this.landLayer) this.landLayer.destroy(true);
    if (this.wallGroup) this.wallGroup.clear(true, true);
    if (this.finishZone) this.finishZone.destroy();
    if (this.finishFlag) this.finishFlag.destroy();
    if (this.car) this.car.destroy();
    if (this.gridLayer) this.gridLayer.destroy(true);

    this.landLayer = null;
    this.wallGroup = null;
    this.finishZone = null;
    this.finishFlag = null;
    this.car = null;
    this.gridLayer = null;
  }

  normalizeGrid(grid){
    const rows = grid.length;
    const cols = Math.max(...grid.map(s=>s.length));
    const out = [];
    for (let y=0; y<rows; y++) out.push(grid[y].padEnd(cols, '.'));
    return out;
  }

  findCell(grid, ch){
    for (let y=0; y<grid.length; y++){
      for (let x=0; x<grid[y].length; x++){
        if (grid[y][x] === ch) return {x, y};
      }
    }
    return null;
  }

  isLand(ch){
    return ch === '#' || ch === 'S';
  }

  neighbors(x, y, cols, rows){
    const out = [];
    if (x > 0) out.push({x:x-1,y});
    if (x < cols-1) out.push({x:x+1,y});
    if (y > 0) out.push({x,y:y-1});
    if (y < rows-1) out.push({x,y:y+1});
    return out;
  }

  chooseFinishCell(grid, startCell){
    const rows = grid.length;
    const cols = grid[0].length;
    const q = [startCell];
    const dist = new Map();
    const key = (x,y)=>`${x},${y}`;
    dist.set(key(startCell.x,startCell.y), 0);

    let best = startCell;
    let bestDist = -1;

    while (q.length){
      const cur = q.shift();
      const d = dist.get(key(cur.x, cur.y));
      if (d > bestDist){
        bestDist = d;
        best = cur;
      }
      for (const n of this.neighbors(cur.x, cur.y, cols, rows)){
        if (!this.isLand(grid[n.y][n.x])) continue;
        const k = key(n.x, n.y);
        if (dist.has(k)) continue;
        dist.set(k, d+1);
        q.push(n);
      }
    }
    return best;
  }

  buildWorld(mapDef){
    this.clearWorld();
    this.debug('1/6 normalizujem mapu');

    const grid = this.normalizeGrid(mapDef.grid);
    const rows = grid.length, cols = grid[0].length;
    this.worldW = cols * CELL;
    this.worldH = rows * CELL;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.landLayer = this.add.container(0, 0);
    this.wallGroup = this.physics.add.staticGroup();

    this.debug('2/6 kreslím terén');
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const ch = grid[y][x];
        const cx = x*CELL + CELL/2;
        const cy = y*CELL + CELL/2;
        const land = this.isLand(ch);

        const tile = this.add.rectangle(
          cx, cy, CELL, CELL,
          land ? 0x48793c : 0x2E7ED3, 1
        );
        this.landLayer.add(tile);

        if (!land){
          const wall = this.add.rectangle(cx, cy, CELL, CELL, 0x000000, 0);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        }
      }
    }

    this.debug('3/6 hledám start a cíl');
    const startCell = this.findCell(grid, 'S') || {x:1, y:1};
    const finishCell = this.chooseFinishCell(grid, startCell);

    const sx = startCell.x*CELL + CELL/2;
    const sy = startCell.y*CELL + CELL/2;
    const fx = finishCell.x*CELL + CELL/2;
    const fy = finishCell.y*CELL + CELL/2;

    this.landLayer.add(this.add.rectangle(sx, sy, CELL*0.90, 8, 0xffffff, 1));
    this.finishFlag = this.add.image(fx, fy-8, 'tex_flag').setScale(0.72);
    this.landLayer.add(this.finishFlag);

    this.finishZone = this.add.zone(fx, fy, CELL*0.9, CELL*0.9);
    this.physics.add.existing(this.finishZone, true);

    this.debug('4/6 vytváram auto');
    const baseW = 34, baseH = 54;
    const wMul = this.selectedCar.widthMul || 1;
    const hMul = this.selectedCar.heightMul || 1;

    this.car = this.physics.add.image(sx, sy, 'tex_car_game');
    this.car.setTint(this.selectedCar.color);
    this.car.setDisplaySize(baseW*wMul, baseH*hMul);
    this.car.body.setSize(baseW*wMul, baseH*hMul, true);
    this.car.setDrag(320, 320);
    this.car.setCollideWorldBounds(true);
    this.car.body.setMaxVelocity(this.selectedCar.maxSpeed, this.selectedCar.maxSpeed);
    this.car.body.setAngularVelocity(0);

    this.debug('5/6 zapínám kolize');
    this.physics.add.collider(this.car, this.wallGroup, ()=>this.onCrash(), null, this);
    this.physics.add.overlap(this.car, this.finishZone, ()=>this.onFinish(), null, this);

    this.debug('6/6 nastavujem kameru');
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.zoom = 1;
    this.cameras.main.startFollow(this.car, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(40, 60);
    this.cameraDetached = false;
  }

  startGame(){
    if (this.starting) return;
    this.starting = true;
    try {
      this.debug('spúšťam hru...');
      this.money = 0;
      this.steer = 0;
      this.wheel.active = false;
      this.wheel.id = null;
      this.wheelKnob.setPosition(this.wheel.cx, this.wheel.cy - (this.wheel.r-16));
      this.touch.gas = false;

      this.buildWorld(this.selectedMap);
      this.uiInfo.setText(`Mapa: ${this.selectedMap.name} • Auto: ${this.selectedCar.name}`);
      this.setState('playing');
      this.debug('');
    } catch (e) {
      this.debug(`chyba: ${String(e.message || e)}`);
      console.error(e);
      this.setState('menu');
    } finally {
      this.starting = false;
    }
  }

  onCrash(){
    if (this.state !== 'playing') return;
    this.money = Math.max(0, this.money - 10);
    this.uiInfo.setText('💥 Náraz');
  }

  onFinish(){
    if (this.state !== 'playing') return;
    this.money += 100;
    this.best = Math.max(this.best, this.money);

    this.uiInfo.setText(`🏁 CÍL! Peníze: ${this.money} (best: ${this.best})`);
    this.lightDot.setFillStyle(0x2bdc4a);

    // freeze car, keep world visible, show start button again
    if (this.car && this.car.body){
      this.car.body.setVelocity(0,0);
      this.car.body.setAngularVelocity(0);
    }
    this.setState('menu');
    this.menuRoot.setVisible(true);
  }

  update(){
    this.uiMoney.setText(`Peníze: ${this.money}`);
    if (this.state !== 'playing' || !this.car) return;

    const gas = this.touch.gas || this.cursors.up.isDown;

    let kbSteer = 0;
    if (this.cursors.left.isDown) kbSteer -= 1;
    if (this.cursors.right.isDown) kbSteer += 1;

    let steer = clamp(this.steer + kbSteer, -1, 1);

    if (!this.wheel.active && kbSteer === 0){
      this.steer = Phaser.Math.Linear(this.steer, 0, 0.12);
      steer = this.steer;
    }

    const speed = this.car.body.speed || 0;
    const speedN = clamp(speed / (this.selectedCar.maxSpeed || 240), 0, 1);

    const turnSpeed = 260;
    this.car.body.setAngularVelocity(steer * turnSpeed * speedN);

    if (gas){
      this.resumeCameraFollow();
      const angleDeg = (this.car.rotation * 180/Math.PI) - 90;
      const v = new Phaser.Math.Vector2();
      this.physics.velocityFromAngle(angleDeg, this.selectedCar.maxSpeed, v);

      const a = clamp((this.selectedCar.accel || 520) / 800, 0.05, 0.18);
      this.car.body.velocity.x = Phaser.Math.Linear(this.car.body.velocity.x, v.x, a);
      this.car.body.velocity.y = Phaser.Math.Linear(this.car.body.velocity.y, v.y, a);
    }
  }

  makeCarTexture(){
    if (!this.textures.exists('tex_car_game')){
      const g = this.add.graphics();
      g.fillStyle(0xffffff,1);
      g.fillRoundedRect(0,0,34,54,8);
      g.fillStyle(0x7a7a7a,1);
      g.fillRect(6,8,22,14);
      g.fillStyle(0x202020,1);
      g.fillCircle(8,10,3); g.fillCircle(26,10,3); g.fillCircle(8,44,3); g.fillCircle(26,44,3);
      g.generateTexture('tex_car_game',34,54);
      g.destroy();
    }
    if (!this.textures.exists('tex_car_menu')){
      const g = this.add.graphics();
      g.fillStyle(0xffffff,1);
      g.fillRoundedRect(0,0,44,72,12);
      g.fillStyle(0x6f6f6f,1);
      g.fillRoundedRect(8,10,28,20,6);
      g.fillStyle(0x1f1f1f,1);
      g.fillCircle(10,14,4); g.fillCircle(34,14,4); g.fillCircle(10,58,4); g.fillCircle(34,58,4);
      g.generateTexture('tex_car_menu',44,72);
      g.destroy();
    }
  }

  makeFlagTexture(){
    if (this.textures.exists('tex_flag')) return;
    const g = this.add.graphics();
    g.lineStyle(3, 0xffffff, 1);
    g.lineBetween(8, 34, 8, 4);
    g.fillStyle(0xffffff,1);
    g.fillRoundedRect(10, 6, 22, 15, 4);
    g.fillStyle(0x3a87ff,1);
    g.fillRect(10, 6, 22, 5);
    g.fillStyle(0xff5959,1);
    g.fillRect(10, 16, 22, 5);
    g.generateTexture('tex_flag', 40, 40);
    g.destroy();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'wrap',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#061626',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MainScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});

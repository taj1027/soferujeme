
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
    this.touch = { gas:false, gasId:null };
    this.wheel = { active:false, id:null, cx:92, cy:VIEW_H-92, r:70 };
    this.wheelAngle = 0;
    this.wheelMaxAngle = 120;

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

    this.makeCarTexture('car_taxi', 60, 92, 0xffd800, 0x111111, false);
    this.makeCarTexture('car_moto', 40, 84, 0xff4fa3, 0xffffff, true);
    this.makeCarTexture('car_auto', 60, 92, 0xf6f6f6, 0x2c7be5, false);
    this.makeFlagTexture();
    this.makeEuropeTexture('atlas_europe', 280, 170);

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
  this.gasBtn = this.add.circle(VIEW_W-82, VIEW_H-84, 54, 0x0c1117, 0.38)
    .setInteractive().setScrollFactor(0).setDepth(1000);
  this.gasInner = this.add.circle(VIEW_W-82, VIEW_H-84, 38, 0x39d84d, 1)
    .setScrollFactor(0).setDepth(1001);
  this.gasTxt = this.add.text(VIEW_W-82, VIEW_H-84, '⛽', { fontSize:'28px', color:'#08250d' })
    .setOrigin(0.5).setScrollFactor(0).setDepth(1002);

  this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x0c1117, 0.40)
    .setScrollFactor(0).setDepth(1000);
  this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r-10, 0xffffff, 0.08)
    .setScrollFactor(0).setDepth(1001);
  this.wheelSpokes = this.add.graphics().setScrollFactor(0).setDepth(1001);
  this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r-14), 11, 0xffffff, 0.22)
    .setScrollFactor(0).setDepth(1002);
  this.renderWheelVisual();

  this.gasBtn.on('pointerdown', (p)=> {
    if (this.state !== 'playing') return;
    this.touch.gas = true;
    this.touch.gasId = p.id;
    this.resumeCameraFollow();
  });
  const releaseGas = (p)=>{
    if (!p || this.touch.gasId === null || p.id === this.touch.gasId){
      this.touch.gas = false;
      this.touch.gasId = null;
    }
  };
  this.gasBtn.on('pointerup', releaseGas);
  this.gasBtn.on('pointerout', releaseGas);
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
  const rawAngle = Phaser.Math.RadToDeg(Math.atan2(dy, dx)) + 90;
  this.wheelAngle = clamp(rawAngle, -this.wheelMaxAngle, this.wheelMaxAngle);
  this.steer = clamp(this.wheelAngle / this.wheelMaxAngle, -1, 1);
  this.renderWheelVisual();
}

renderWheelVisual(){
  const rad = Phaser.Math.DegToRad(this.wheelAngle - 90);
  const r = this.wheel.r - 14;
  const x = this.wheel.cx + Math.cos(rad) * r;
  const y = this.wheel.cy + Math.sin(rad) * r;
  if (this.wheelKnob) this.wheelKnob.setPosition(x, y);

  if (this.wheelSpokes){
    const g = this.wheelSpokes;
    g.clear();
    g.lineStyle(5, 0xffffff, 0.16);
    for (const a of [0, 120, 240]){
      const rr = Phaser.Math.DegToRad(a + this.wheelAngle - 90);
      g.lineBetween(this.wheel.cx, this.wheel.cy, this.wheel.cx + Math.cos(rr)*(this.wheel.r-18), this.wheel.cy + Math.sin(rr)*(this.wheel.r-18));
    }
    g.lineStyle(3, 0xffffff, 0.10);
    g.strokeCircle(this.wheel.cx, this.wheel.cy, this.wheel.r-24);
  }
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

  this.carCards = [];
  const carY = 250;
  const cardW = 82, cardH = 110;
  const xs = [78, 195, 312];
  CARS.forEach((car, i)=>{
    const cont = this.add.container(xs[i], carY);
    const bg = this.add.rectangle(0, 0, cardW, cardH, COLORS.card, 1)
      .setStrokeStyle(2, COLORS.cardBorder, 0.95).setInteractive({ useHandCursor:true });
    const tex = car.id === 'taxi' ? 'car_taxi' : car.id === 'motorka' ? 'car_moto' : 'car_auto';
    const icon = this.add.image(0, -18, tex);
    if (car.id === 'motorka') icon.setScale(0.46);
    else icon.setScale(0.50);
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

  this.mapPanel = this.add.container(w/2, 525).setScrollFactor(0).setDepth(2002);
  const mapBgOuter = this.add.rectangle(0, 0, 284, 164, COLORS.ocean, 1)
    .setStrokeStyle(2, COLORS.cardBorder, 0.95);
  const europeImg = this.add.image(0, 0, 'atlas_europe');
  const slGlow = this.add.graphics();
  this.drawSloveniaOutline(slGlow, 22, 25, 0xfff0a0, 0xffd94d);
  const slHit = this.add.zone(23, 25, 54, 28).setInteractive({ useHandCursor:true });
  slHit.on('pointerdown', ()=>{
    this.selectedMap = MAPS.si;
    this.refreshMenuVisuals();
  });
  const locked = [];
  [
    { x:-90, y:-38, name:'Španielsko' },
    { x:-34, y:-18, name:'Francúzsko' },
    { x:16, y:-48, name:'Nemecko' },
    { x:-2, y:36, name:'Taliansko' },
    { x:90, y:-4, name:'Rumunsko' }
  ].forEach((p)=>{
    locked.push(this.add.text(p.x, p.y, '🔒', { fontSize:'17px' }).setOrigin(0.5));
    locked.push(this.add.text(p.x, p.y + 18, p.name, { fontSize:'9px', color:'#d6e6ff' }).setOrigin(0.5));
  });
  const slTxt = this.add.text(48, 52, 'Slovinsko', { fontSize:'16px', color:'#fff7bf', fontStyle:'bold' }).setOrigin(0.5);
  const worldTag = this.add.text(-92, -56, '← svetadiely', {
    fontSize:'11px', color:'#c6e6ff', backgroundColor:'#15334f', padding:{left:6,right:6,top:3,bottom:3}
  }).setOrigin(0.5);
  this.mapPanel.add([mapBgOuter, europeImg, slGlow, slHit, slTxt, worldTag, ...locked]);
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
    card.bg.setStrokeStyle(selected ? 3 : 2, 0xffffff, selected ? 1 : 0.85);
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

    [this.wheelBase, this.wheelRing, this.wheelSpokes, this.wheelKnob, this.gasBtn, this.gasInner, this.gasTxt].forEach(o=>o.setVisible(playing));
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

    const tex = this.selectedCar.id === 'taxi' ? 'car_taxi' : this.selectedCar.id === 'motorka' ? 'car_moto' : 'car_auto';
    this.car = this.physics.add.image(sx, sy, tex);
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
      this.wheelAngle = 0;
      this.wheel.active = false;
      this.wheel.id = null;
      this.renderWheelVisual();
      this.touch.gas = false;
      this.touch.gasId = null;

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
const kbSteer = (this.cursors.left.isDown ? -1 : 0) + (this.cursors.right.isDown ? 1 : 0);

let steer = this.steer;
if (!this.wheel.active && kbSteer !== 0){
  steer = kbSteer;
}

const speed = this.car.body.speed || 0;
const speedN = clamp(speed / this.selectedCar.maxSpeed, 0, 1);
const turnSpeed = 280;
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


makeCarTexture(key, w, h, bodyColor, stripeColor, moto=false){
  if (this.textures.exists(key)) return;
  const g = this.add.graphics();
  if (moto){
    g.fillStyle(0x111111, 1).fillCircle(w * 0.35, h * 0.78, 8).fillCircle(w * 0.65, h * 0.78, 8);
    g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.36, h * 0.16, w * 0.28, h * 0.52, 10);
    g.fillStyle(stripeColor, 0.95).fillRect(w * 0.44, h * 0.22, w * 0.12, h * 0.24);
    g.fillStyle(0x7fc8ff, 0.92).fillRoundedRect(w * 0.39, h * 0.48, w * 0.22, h * 0.12, 5); // rear window
    g.lineStyle(4, 0x333333, 1).lineBetween(w * 0.28, h * 0.32, w * 0.72, h * 0.32).lineBetween(w * 0.36, h * 0.68, w * 0.64, h * 0.68);
    g.fillStyle(0xff3333, 0.95).fillCircle(w * 0.50, h * 0.72, 4); // one rear light
  } else {
    g.fillStyle(0x111111, 1).fillCircle(w * 0.23, h * 0.2, 8).fillCircle(w * 0.77, h * 0.2, 8).fillCircle(w * 0.23, h * 0.8, 8).fillCircle(w * 0.77, h * 0.8, 8);
    g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.18, h * 0.08, w * 0.64, h * 0.84, 16);
    g.fillStyle(0x7fc8ff, 0.92).fillRoundedRect(w * 0.28, h * 0.54, w * 0.44, h * 0.18, 8); // rear window
    g.fillStyle(stripeColor, 0.95).fillRect(w * 0.43, h * 0.14, w * 0.14, h * 0.64);
    g.fillStyle(0xff3333, 0.9).fillRect(w * 0.25, h * 0.76, 8, 8).fillRect(w * 0.67, h * 0.76, 8, 8);
  }
  g.generateTexture(key, w, h);
  g.destroy();
}

drawSloveniaOutline(g, cx, cy, stroke, fill){
  g.clear();
  g.fillStyle(fill, 0.22);
  g.lineStyle(2, stroke, 1);
  const pts = [
    [-22, -3],[-17,-8],[-10,-10],[-2,-12],[8,-10],[15,-7],[22,-2],[20,3],[12,7],[4,8],[-3,11],[-12,10],[-18,6],[-22,1]
  ];
  g.beginPath();
  g.moveTo(cx + pts[0][0], cy + pts[0][1]);
  for (let i=1;i<pts.length;i++) g.lineTo(cx + pts[i][0], cy + pts[i][1]);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

makeEuropeTexture(key, w, h){
  if (this.textures.exists(key)) return;
  const g = this.add.graphics();
  g.fillStyle(0x3f86d9, 1).fillRoundedRect(0, 0, w, h, 18);

  const poly = (pts, fill)=>{
    g.fillStyle(fill, 1);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fillPath();
    g.lineStyle(1, 0xe9fff0, 0.34).strokePath();
  };

  poly([[30,102],[46,86],[64,80],[76,88],[70,104],[52,114],[36,112]], 0x5fb95a);
  poly([[64,84],[86,70],[116,68],[132,74],[134,90],[116,102],[86,100],[72,94]], 0x67c164);
  poly([[116,66],[136,56],[152,62],[154,82],[138,94],[122,88]], 0x72ca6d);
  poly([[124,96],[148,92],[168,102],[170,118],[152,130],[132,120]], 0x6bc566);
  poly([[104,102],[122,108],[128,146],[116,150],[98,122]], 0x62bb5d);
  poly([[148,102],[170,100],[184,108],[182,120],[166,126],[150,118]], 0x80d879);
  poly([[156,62],[188,54],[220,64],[234,82],[226,104],[198,106],[176,94],[162,82]], 0x73c76f);
  poly([[110,28],[126,18],[150,18],[160,34],[150,44],[128,42]], 0x79cf72);
  poly([[142,138],[156,136],[166,146],[164,160],[150,162],[142,152]], 0x69bf63);
  g.fillStyle(0xffe069, 0.28);
  g.lineStyle(2, 0xfff18c, 1);
  g.beginPath();
  g.moveTo(150, 106); g.lineTo(156, 101); g.lineTo(164, 99); g.lineTo(172, 101); g.lineTo(179, 104); g.lineTo(184, 108); g.lineTo(182, 113); g.lineTo(174, 116); g.lineTo(166, 116); g.lineTo(159, 119); g.lineTo(152, 117); g.lineTo(148, 112); g.closePath();
  g.fillPath();
  g.strokePath();
  g.generateTexture(key, w, h);
  g.destroy();
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

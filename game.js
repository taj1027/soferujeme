
// Šoférujeme 4 — Phaser 3
// Based only on the last working branch (v14), with fixes for:
// - continent selection before country selection
// - persistent steering wheel that does not spring back
// - multitouch wheel + gas
// - pretty blue/green world and Europe previews
// - finish always on valid drivable land
// - one-finger pan and two-finger pinch zoom while detached

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
    '..........#####...........',
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
    this.mapStage = 'continents';

    this.steer = 0;
    this.touch = { gas:false, gasId:null };
    this.wheel = { active:false, id:null, cx:92, cy:VIEW_H-92, r:72 };
    this.wheelAngle = 0; // persistent wheel position
    this.wheelMaxAngle = 150;

    this.dragPan = { active:false, id:null, startX:0, startY:0, camX:0, camY:0 };
    this.pinch = { active:false, ids:[], startDist:0, startZoom:1 };
    this.cameraDetached = false;
    this.starting = false;

    this.audioReady = false;
    this.audioCtx = null;
    this.engineOsc = null;
    this.engineGain = null;
  }

  create(){
    document.title = 'Šoférujeme 4';
    this.input.addPointer(3);

    this.makeCarTexture('car_taxi', 60, 92, 0xffd800, 0x111111, false);
    this.makeCarTexture('car_moto', 40, 84, 0xff4fa3, 0xffffff, true);
    this.makeCarTexture('car_auto', 60, 92, 0xf6f6f6, 0x2c7be5, false);
    this.makeFlagTexture();
    this.makeWorldTexture('atlas_world', 280, 170);
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
    this.uiTitle = this.add.text(VIEW_W/2, 18, 'Šoférujeme 4', { fontSize:'18px', fontStyle:'bold', color:COLORS.text }).setOrigin(0.5).setScrollFactor(0).setDepth(900);
    this.uiMoney = this.add.text(12, 46, 'Peníze: 0', { fontSize:'16px', color:COLORS.text }).setScrollFactor(0).setDepth(900);
    this.uiInfo = this.add.text(12, 68, '', { fontSize:'13px', color:'#d0e7ff' }).setScrollFactor(0).setDepth(900);
    this.btnBackMenu = this.add.text(VIEW_W-16, 52, '← menu', {
      fontSize:'15px', color:'#d8ebff', backgroundColor:'#15334f', padding:{left:8,right:8,top:4,bottom:4}, fontStyle:'bold'
    }).setOrigin(1,0.5).setInteractive({ useHandCursor:true }).setScrollFactor(0).setDepth(902);
    this.btnBackMenu.on('pointerdown', ()=> this.returnToMenu());
  }

  buildControls(){
    this.gasBtn = this.add.circle(VIEW_W-82, VIEW_H-84, 54, 0x0c1117, 0.38).setInteractive().setScrollFactor(0).setDepth(1000);
    this.gasInner = this.add.circle(VIEW_W-82, VIEW_H-84, 38, 0x39d84d, 1).setScrollFactor(0).setDepth(1001);
    this.gasTxt = this.add.text(VIEW_W-82, VIEW_H-84, '⛽', { fontSize:'28px', color:'#08250d' }).setOrigin(0.5).setScrollFactor(0).setDepth(1002);

    this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x0c1117, 0.40).setScrollFactor(0).setDepth(1000);
    this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r-10, 0xffffff, 0.08).setScrollFactor(0).setDepth(1001);
    this.wheelSpokes = this.add.graphics().setScrollFactor(0).setDepth(1001);
    this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r-14), 11, 0xffffff, 0.22).setScrollFactor(0).setDepth(1002);
    this.renderWheelVisual();

    this.gasBtn.on('pointerdown', (p)=> {
      if (this.state !== 'playing') return;
      this.ensureAudio();
      this.touch.gas = true;
      this.touch.gasId = p.id;
      this.resumeCameraFollow();
      this.startEngineSound();
    });
    const releaseGas = (p)=>{
      if (!p || this.touch.gasId === null || p.id === this.touch.gasId){
        this.touch.gas = false;
        this.touch.gasId = null;
        this.stopEngineSound();
      }
    };
    this.gasBtn.on('pointerup', releaseGas);
    this.gasBtn.on('pointerout', releaseGas);
  }

  installInputHandlers(){
    this.cursors = this.input.keyboard.createCursorKeys();

    this.input.on('pointerdown', (p)=>{
      if (this.state === 'playing') {
        const dx = p.x - this.wheel.cx;
        const dy = p.y - this.wheel.cy;
        if (Math.hypot(dx,dy) <= this.wheel.r){
          this.ensureAudio();
          this.wheel.active = true;
          this.wheel.id = p.id;
          this.resumeCameraFollow();
          this.updateWheelFromPointer(p);
          return;
        }
      }

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

    this.input.on('pointerup', (p)=>{
      if (this.wheel.active && p.id === this.wheel.id){
        this.wheel.active = false;
        this.wheel.id = null;
      }
      if (this.dragPan.active && p.id === this.dragPan.id){
        this.dragPan.active = false;
        this.dragPan.id = null;
      }
      if (!p || this.touch.gasId === null || p.id === this.touch.gasId){
        this.touch.gas = false;
        this.touch.gasId = null;
        this.stopEngineSound();
      }

      const active = this.input.manager.pointers.filter(pp => pp.isDown);
      if (active.length < 2){
        this.pinch.active = false;
        this.pinch.ids = [];
      }
    });

    this.input.on('pointerupoutside', (p)=>{
      if (this.wheel.active && (!p || p.id === this.wheel.id)){
        this.wheel.active = false;
        this.wheel.id = null;
      }
      if (!p || this.touch.gasId === null || p.id === this.touch.gasId){
        this.touch.gas = false;
        this.touch.gasId = null;
        this.stopEngineSound();
      }
    });
  }

  beginPinch(a, b){
    this.detachCamera();
    this.dragPan.active = false;
    this.pinch.active = true;
    this.pinch.ids = [a.id, b.id];
    this.pinch.startDist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    this.pinch.startZoom = this.cameras.main.zoom;
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
    const usable = this.wheel.r * 0.78;
    this.steer = clamp(dx / usable, -1, 1);
    this.wheelAngle = this.steer * 115;
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

  buildMenu(){
    const w = VIEW_W, h = VIEW_H;
    this.menuRoot = this.add.container(0, 0);
    const add = obj => { this.menuRoot.add(obj); return obj; };

    add(this.add.rectangle(w/2, h/2+22, w*0.92, h*0.80, COLORS.panel, 0.95).setStrokeStyle(2, COLORS.panelBorder, 1).setScrollFactor(0).setDepth(2000));

    add(this.add.text(w/2, 150, 'AUTÁ', { fontSize:'16px', fontStyle:'bold', color:COLORS.subtext }).setOrigin(0.5).setScrollFactor(0).setDepth(2001));

    this.carCards = [];
    const carY = 250;
    const cardW = 82, cardH = 110;
    const xs = [78, 195, 312];
    CARS.forEach((car, i)=>{
      const cont = this.add.container(xs[i], carY);
      const bg = this.add.rectangle(0, 0, cardW, cardH, COLORS.card, 1).setStrokeStyle(2, COLORS.cardBorder, 0.95).setInteractive({ useHandCursor:true });
      const tex = car.id === 'taxi' ? 'car_taxi' : car.id === 'motorka' ? 'car_moto' : 'car_auto';
      const icon = this.add.image(0, -18, tex);
      icon.setScale(car.id === 'motorka' ? 0.46 : 0.50);
      const name = this.add.text(0, 24, car.name, { fontSize:'14px', color:'#ffffff', fontStyle:'bold' }).setOrigin(0.5);
      const speed = this.add.text(0, 44, `max ${car.maxSpeed}`, { fontSize:'11px', color:'#e8f4ff' }).setOrigin(0.5);
      cont.add([bg, icon, name, speed]);
      cont.setScrollFactor(0).setDepth(2002);
      bg.on('pointerdown', ()=> { this.selectedCarIndex = i; this.selectedCar = CARS[i]; this.refreshMenuVisuals(); });
      this.menuRoot.add(cont);
      this.carCards.push({ cont, bg, icon, name, speed });
    });

    add(this.add.text(w/2, 410, 'MAPY', { fontSize:'16px', fontStyle:'bold', color:COLORS.subtext }).setOrigin(0.5).setScrollFactor(0).setDepth(2001));
    this.mapStageLink = add(this.add.text(w/2, 438, 'Svetadiely', { fontSize:'12px', color:'#cfe8ff', backgroundColor:'#15334f', padding:{left:8,right:8,top:3,bottom:3}, fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(2002).setInteractive({ useHandCursor:true }));
    this.mapStageLink.on('pointerdown', ()=> { this.mapStage = 'continents'; this.refreshMenuVisuals(); });

    this.mapPanel = this.add.container(w/2, 525).setScrollFactor(0).setDepth(2002);
    this.menuRoot.add(this.mapPanel);
    const panelBorder = this.add.rectangle(0, 0, 284, 164, 0x2E7ED3, 1).setStrokeStyle(2, COLORS.cardBorder, 0.95);
    this.mapPanel.add(panelBorder);

    this.worldView = this.add.container(0,0);
    const worldImg = this.add.image(0,0,'atlas_world');
    const europeHit = this.add.zone(28,-26,70,54).setInteractive({ useHandCursor:true });
    europeHit.on('pointerdown', ()=> { this.mapStage = 'europe'; this.refreshMenuVisuals(); });
    const europeTag = this.add.text(28,-63,'Európa',{ fontSize:'12px', color:'#fff7bf', fontStyle:'bold', backgroundColor:'#1b4d78', padding:{left:4,right:4,top:2,bottom:2} }).setOrigin(0.5);
    const europeGlow = this.add.graphics();
    europeGlow.lineStyle(2, 0xffef92, 1).strokeEllipse(28,-26,64,46);
    const locks = [];
    [
      {x:-90,y:-18,t:'S. Amerika'}, {x:-56,y:34,t:'J. Amerika'}, {x:100,y:-42,t:'Ázia'}, {x:82,y:28,t:'Afrika'}, {x:118,y:58,t:'Austrália'}
    ].forEach(v=>{ locks.push(this.add.text(v.x,v.y,'🔒',{fontSize:'16px'}).setOrigin(0.5)); locks.push(this.add.text(v.x,v.y+16,v.t,{fontSize:'9px',color:'#d6e6ff'}).setOrigin(0.5)); });
    this.worldView.add([worldImg, europeGlow, europeHit, europeTag, ...locks]);
    this.mapPanel.add(this.worldView);

    this.europeView = this.add.container(0,0);
    const europeImg = this.add.image(0,0,'atlas_europe');
    const slGlow = this.add.graphics();
    this.drawSloveniaOutline(slGlow, 22, 25, 0xfff0a0, 0xffd94d);
    const slHit = this.add.zone(23, 25, 54, 28).setInteractive({ useHandCursor:true });
    slHit.on('pointerdown', ()=> { this.selectedMap = MAPS.si; this.refreshMenuVisuals(); });
    const backTag = this.add.text(-92, -56, '', { fontSize:'1px', color:'#000000' }).setOrigin(0.5);
    const locked2 = [];
    [
      { x:-90, y:-38, name:'Španielsko' }, { x:-34, y:-18, name:'Francúzsko' }, { x:16, y:-48, name:'Nemecko' },
      { x:-2, y:36, name:'Taliansko' }, { x:90, y:-4, name:'Rumunsko' }
    ].forEach((p)=>{ locked2.push(this.add.text(p.x,p.y,'🔒',{fontSize:'17px'}).setOrigin(0.5)); locked2.push(this.add.text(p.x,p.y+18,p.name,{fontSize:'9px',color:'#d6e6ff'}).setOrigin(0.5)); });
    const slTxt = this.add.text(48, 52, 'Slovinsko', { fontSize:'16px', color:'#fff7bf', fontStyle:'bold' }).setOrigin(0.5);
    this.europeView.add([europeImg, slGlow, slHit, slTxt, backTag, ...locked2]);
    this.mapPanel.add(this.europeView);

    this.selectionText = add(this.add.text(w/2, 630, '', { fontSize:'16px', color:'#fff' }).setOrigin(0.5).setScrollFactor(0).setDepth(2002));
    this.btnStart = add(this.add.rectangle(w/2, 705, 212, 58, 0x2bdc4a, 1).setInteractive({ useHandCursor:true }).setScrollFactor(0).setDepth(2002));
    this.btnStartTxt = add(this.add.text(w/2, 705, 'ŠTART', { fontSize:'22px', fontStyle:'bold', color:'#111' }).setOrigin(0.5).setScrollFactor(0).setDepth(2003));
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
    this.worldView.setVisible(this.mapStage === 'continents');
    this.europeView.setVisible(this.mapStage === 'europe');
    this.mapStageLink.setText(this.mapStage === 'continents' ? 'Svetadiely' : '← späť na svetadiely');
    this.selectionText.setText(`Auto: ${this.selectedCar.name}   •   Mapa: ${this.selectedMap.name}`);
  }

  setState(s){
    this.state = s;
    const showMenu = s === 'menu';
    const playing = s === 'playing';
    this.menuRoot.setVisible(showMenu);
    this.mapPanel.setVisible(showMenu);
    [this.wheelBase, this.wheelRing, this.wheelSpokes, this.wheelKnob, this.gasBtn, this.gasInner, this.gasTxt].forEach(o=>o.setVisible(playing));
    this.btnBackMenu.setVisible(playing);
    this.uiInfo.setText(showMenu ? 'Vyber auto a mapu, potom štart.' : `Mapa: ${this.selectedMap.name} • Auto: ${this.selectedCar.name}`);
    if (!showMenu){
      this.menuRoot.iterate?.(()=>{});
    }
  }

  clearWorld(){
    if (this.landLayer) this.landLayer.destroy(true);
    if (this.wallGroup) this.wallGroup.clear(true, true);
    if (this.finishZone) this.finishZone.destroy();
    if (this.finishFlag) this.finishFlag.destroy();
    if (this.car) this.car.destroy();
    this.landLayer = null; this.wallGroup = null; this.finishZone = null; this.finishFlag = null; this.car = null;
  }

  normalizeGrid(grid){
    const rows = grid.length; const cols = Math.max(...grid.map(s=>s.length));
    const out = []; for (let y=0; y<rows; y++) out.push(grid[y].padEnd(cols, '.')); return out;
  }
  findCell(grid, ch){ for (let y=0; y<grid.length; y++) for (let x=0; x<grid[y].length; x++) if (grid[y][x] === ch) return {x,y}; return null; }
  isLand(ch){ return ch === '#' || ch === 'S'; }
  neighbors(x,y,cols,rows){ const out=[]; if(x>0)out.push({x:x-1,y}); if(x<cols-1)out.push({x:x+1,y}); if(y>0)out.push({x,y:y-1}); if(y<rows-1)out.push({x,y:y+1}); return out; }
  chooseFinishCell(grid, startCell){
    const rows=grid.length, cols=grid[0].length, q=[startCell], dist=new Map(), key=(x,y)=>`${x},${y}`; dist.set(key(startCell.x,startCell.y),0);
    let best=startCell, bestDist=-1;
    while(q.length){
      const cur=q.shift(), d=dist.get(key(cur.x,cur.y));
      if(d>bestDist){ bestDist=d; best=cur; }
      for(const n of this.neighbors(cur.x,cur.y,cols,rows)){
        if(!this.isLand(grid[n.y][n.x])) continue; const k=key(n.x,n.y); if(dist.has(k)) continue; dist.set(k,d+1); q.push(n);
      }
    }
    return best;
  }

  buildWorld(mapDef){
    this.clearWorld();
    const grid = this.normalizeGrid(mapDef.grid);
    const rows = grid.length, cols = grid[0].length;
    this.worldW = cols * CELL; this.worldH = rows * CELL;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.landLayer = this.add.container(0, 0);
    this.wallGroup = this.physics.add.staticGroup();
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const ch = grid[y][x], cx = x*CELL + CELL/2, cy = y*CELL + CELL/2, land = this.isLand(ch);
        this.landLayer.add(this.add.rectangle(cx, cy, CELL, CELL, land ? 0x48793c : 0x2E7ED3, 1));
        if (!land){
          const wall = this.add.rectangle(cx, cy, CELL, CELL, 0x000000, 0); this.physics.add.existing(wall, true); this.wallGroup.add(wall);
        }
      }
    }

    const startCell = this.findCell(grid, 'S') || {x:1, y:1};
    const finishCell = this.chooseFinishCell(grid, startCell);
    const sx = startCell.x*CELL + CELL/2, sy = startCell.y*CELL + CELL/2, fx = finishCell.x*CELL + CELL/2, fy = finishCell.y*CELL + CELL/2;
    this.landLayer.add(this.add.rectangle(sx, sy, CELL*0.90, 8, 0xffffff, 1));
    this.finishFlag = this.add.image(fx, fy-8, 'tex_flag').setScale(0.72); this.landLayer.add(this.finishFlag);
    this.finishZone = this.add.zone(fx, fy, CELL*0.9, CELL*0.9); this.physics.add.existing(this.finishZone, true);

    const baseW = 34, baseH = 54, wMul = this.selectedCar.widthMul || 1, hMul = this.selectedCar.heightMul || 1;
    const tex = this.selectedCar.id === 'taxi' ? 'car_taxi' : this.selectedCar.id === 'motorka' ? 'car_moto' : 'car_auto';
    this.car = this.physics.add.image(sx, sy, tex);
    this.car.setDisplaySize(baseW*wMul, baseH*hMul);
    this.car.body.setSize(baseW*wMul, baseH*hMul, true);
    this.car.setDrag(320, 320);
    this.car.setCollideWorldBounds(true);
    this.car.body.setMaxVelocity(this.selectedCar.maxSpeed, this.selectedCar.maxSpeed);
    this.car.body.setAngularVelocity(0);

    this.physics.add.collider(this.car, this.wallGroup, ()=>this.onCrash(), null, this);
    this.physics.add.overlap(this.car, this.finishZone, ()=>this.onFinish(), null, this);

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
      this.ensureAudio();
      this.touch.gas = false; this.touch.gasId = null;
      this.stopEngineSound();
      this.buildWorld(this.selectedMap);
      this.setState('playing');
    } finally { this.starting = false; }
  }

  returnToMenu(){
    this.touch.gas = false;
    this.touch.gasId = null;
    this.stopEngineSound();
    if (this.car && this.car.body){
      this.car.body.setVelocity(0,0);
      this.car.body.setAngularVelocity(0);
    }
    this.setState('menu');
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
    this.playWinTune();
    if (this.car && this.car.body){ this.car.body.setVelocity(0,0); this.car.body.setAngularVelocity(0); }
    this.setState('menu');
    this.menuRoot.setVisible(true);
  }

  update(_time, delta){
    this.uiMoney.setText(`Peníze: ${this.money}`);
    if (this.state !== 'playing' || !this.car) return;

    const gas = this.touch.gas || this.cursors.up.isDown;
    const kbSteer = (this.cursors.left.isDown ? -1 : 0) + (this.cursors.right.isDown ? 1 : 0);
    const steer = this.wheel.active || this.wheelAngle !== 0 ? this.steer : kbSteer;
    const dt = delta / 1000;
    const speed = this.car.body.speed || 0;
    const moving = speed > 8;

    if (moving){
      const turnRateDeg = 160;
      const speedN = clamp(speed / this.selectedCar.maxSpeed, 0, 1);
      const yaw = steer * turnRateDeg * (0.20 + 0.80 * speedN) * dt;
      this.car.rotation += Phaser.Math.DegToRad(yaw);
    }

    if (gas){
      this.resumeCameraFollow();
      const angleDeg = (this.car.rotation * 180/Math.PI) - 90;
      const target = new Phaser.Math.Vector2();
      this.physics.velocityFromAngle(angleDeg, this.selectedCar.maxSpeed, target);
      const a = clamp((this.selectedCar.accel || 520) / 820, 0.07, 0.22);
      this.car.body.velocity.x = Phaser.Math.Linear(this.car.body.velocity.x, target.x, a);
      this.car.body.velocity.y = Phaser.Math.Linear(this.car.body.velocity.y, target.y, a);
      this.startEngineSound();
    } else {
      this.stopEngineSound();
    }
    this.updateEngineSound(speed, gas);
  }


  ensureAudio(){
    if (this.audioReady) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.audioCtx = new Ctx();
    this.audioReady = true;
  }

  startEngineSound(){
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    if (this.engineOsc) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const filter = this.audioCtx.createBiquadFilter();
    osc.type = 'sawtooth';
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    osc.frequency.value = 90;
    gain.gain.value = 0.0001;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.045, this.audioCtx.currentTime + 0.05);
    this.engineOsc = osc;
    this.engineGain = gain;
    this.engineFilter = filter;
  }

  updateEngineSound(speed, gas){
    if (!this.engineOsc || !this.audioCtx) return;
    const t = this.audioCtx.currentTime;
    const s = clamp((speed || 0) / (this.selectedCar?.maxSpeed || 240), 0, 1);
    this.engineOsc.frequency.setTargetAtTime(85 + s * 120 + (gas ? 22 : 0), t, 0.04);
    if (this.engineFilter) this.engineFilter.frequency.setTargetAtTime(350 + s * 900, t, 0.07);
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(gas ? 0.05 : 0.0001, t, 0.05);
  }

  stopEngineSound(){
    if (!this.engineOsc || !this.audioCtx) return;
    const osc = this.engineOsc, gain = this.engineGain, t = this.audioCtx.currentTime;
    this.engineOsc = null; this.engineGain = null; this.engineFilter = null;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.stop(t + 0.1);
    } catch(e){}
  }

  playWinTune(){
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const start = this.audioCtx.currentTime + 0.02;
    notes.forEach((freq, i)=>{
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain); gain.connect(this.audioCtx.destination);
      const t0 = start + i * 0.18;
      osc.start(t0);
      gain.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.stop(t0 + 0.24);
    });
  }

  makeCarTexture(key, w, h, bodyColor, stripeColor, moto=false){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    if (moto){
      g.fillStyle(0x111111, 1).fillCircle(w * 0.35, h * 0.78, 8).fillCircle(w * 0.65, h * 0.78, 8);
      g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.36, h * 0.16, w * 0.28, h * 0.52, 10);
      g.fillStyle(stripeColor, 0.95).fillRect(w * 0.44, h * 0.22, w * 0.12, h * 0.24);
      g.fillStyle(0x7fc8ff, 0.92).fillRoundedRect(w * 0.39, h * 0.58, w * 0.22, h * 0.10, 5);
      g.lineStyle(4, 0x333333, 1).lineBetween(w * 0.28, h * 0.32, w * 0.72, h * 0.32).lineBetween(w * 0.36, h * 0.68, w * 0.64, h * 0.68);
      g.fillStyle(0xfff2a3, 0.95).fillCircle(w * 0.50, h * 0.18, 5);
    } else {
      g.fillStyle(0x111111, 1).fillCircle(w * 0.23, h * 0.2, 8).fillCircle(w * 0.77, h * 0.2, 8).fillCircle(w * 0.23, h * 0.8, 8).fillCircle(w * 0.77, h * 0.8, 8);
      g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.18, h * 0.08, w * 0.64, h * 0.84, 16);
      g.fillStyle(0x7fc8ff, 0.92).fillRoundedRect(w * 0.28, h * 0.62, w * 0.44, h * 0.16, 8);
      g.fillStyle(stripeColor, 0.95).fillRect(w * 0.43, h * 0.14, w * 0.14, h * 0.64);
      g.fillStyle(0xff3333, 0.9).fillRect(w * 0.25, h * 0.76, 8, 8).fillRect(w * 0.67, h * 0.76, 8, 8);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  drawSloveniaOutline(g, cx, cy, stroke, fill){
    g.clear();
    g.fillStyle(fill, 0.22); g.lineStyle(2, stroke, 1);
    const pts = [[-22,-3],[-17,-8],[-10,-10],[-2,-12],[8,-10],[15,-7],[22,-2],[20,3],[12,7],[4,8],[-3,11],[-12,10],[-18,6],[-22,1]];
    g.beginPath(); g.moveTo(cx + pts[0][0], cy + pts[0][1]); for (let i=1;i<pts.length;i++) g.lineTo(cx + pts[i][0], cy + pts[i][1]); g.closePath(); g.fillPath(); g.strokePath();
  }

  makeWorldTexture(key, w, h){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0x3f86d9, 1).fillRoundedRect(0, 0, w, h, 18);
    const poly = (pts, fill)=>{ g.fillStyle(fill, 1); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i=1; i<pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillPath(); g.lineStyle(1, 0xe9fff0, 0.26).strokePath(); };
    poly([[24,32],[74,24],[92,36],[82,60],[40,64],[22,52]],0x68c463);        // North America
    poly([[82,74],[102,82],[112,116],[96,144],[82,132],[74,104]],0x69c365);   // South America
    poly([[122,30],[146,26],[160,34],[158,48],[138,50],[124,42]],0x73ca6d);   // Europe
    poly([[128,54],[152,58],[162,84],[152,118],[128,132],[116,94]],0x63bc5f); // Africa
    poly([[154,30],[208,22],[254,42],[248,78],[204,88],[166,66]],0x7bd476);   // Asia
    poly([[218,112],[248,114],[262,132],[250,148],[224,144],[210,128]],0x72c96c); // Australia
    g.generateTexture(key, w, h); g.destroy();
  }

  makeEuropeTexture(key, w, h){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0x3f86d9, 1).fillRoundedRect(0, 0, w, h, 18);
    const poly = (pts, fill)=>{ g.fillStyle(fill, 1); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillPath(); g.lineStyle(1, 0xe9fff0, 0.34).strokePath(); };
    poly([[30,102],[46,86],[64,80],[76,88],[70,104],[52,114],[36,112]], 0x5fb95a);
    poly([[64,84],[86,70],[116,68],[132,74],[134,90],[116,102],[86,100],[72,94]], 0x67c164);
    poly([[116,66],[136,56],[152,62],[154,82],[138,94],[122,88]], 0x72ca6d);
    poly([[124,96],[148,92],[168,102],[170,118],[152,130],[132,120]], 0x6bc566);
    poly([[104,102],[122,108],[128,146],[116,150],[98,122]], 0x62bb5d);
    poly([[148,102],[170,100],[184,108],[182,120],[166,126],[150,118]], 0x80d879);
    poly([[156,62],[188,54],[220,64],[234,82],[226,104],[198,106],[176,94],[162,82]], 0x73c76f);
    poly([[110,28],[126,18],[150,18],[160,34],[150,44],[128,42]], 0x79cf72);
    poly([[142,138],[156,136],[166,146],[164,160],[150,162],[142,152]], 0x69bf63);
    g.fillStyle(0xffe069, 0.28); g.lineStyle(2, 0xfff18c, 1);
    g.beginPath(); g.moveTo(150,106); g.lineTo(156,101); g.lineTo(164,99); g.lineTo(172,101); g.lineTo(179,104); g.lineTo(184,108); g.lineTo(182,113); g.lineTo(174,116); g.lineTo(166,116); g.lineTo(159,119); g.lineTo(152,117); g.lineTo(148,112); g.closePath(); g.fillPath(); g.strokePath();
    g.generateTexture(key, w, h); g.destroy();
  }

  makeFlagTexture(){
    if (this.textures.exists('tex_flag')) return;
    const g = this.add.graphics();
    g.lineStyle(3, 0xffffff, 1); g.lineBetween(8, 34, 8, 4);
    g.fillStyle(0xffffff,1).fillRoundedRect(10, 6, 22, 15, 4);
    g.fillStyle(0x3a87ff,1).fillRect(10, 6, 22, 5);
    g.fillStyle(0xff5959,1).fillRect(10, 16, 22, 5);
    g.generateTexture('tex_flag', 40, 40); g.destroy();
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

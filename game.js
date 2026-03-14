
// Tadi Autá 4 — Phaser 3
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
  { id:'taxi',    name:'Taxi',    color:0xffd800, maxSpeed:115, accel:320, widthMul:1.0, heightMul:1.0, engineBase:64, engineTop:132, engineGain:0.055 },
  { id:'motorka', name:'Motorka', color:0xff69b4, maxSpeed:1120, accel:1800, widthMul:0.55, heightMul:0.85, engineBase:138, engineTop:520, engineGain:0.035 },
  { id:'auto',    name:'Auto',    color:0xffffff, maxSpeed:120, accel:330, widthMul:1.0, heightMul:1.0, engineBase:84, engineTop:160, engineGain:0.048 },
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
    this.touch = { gas:false, gasId:null, reverse:false, reverseId:null, horn:false, hornId:null };
    this.wheel = { active:false, id:null, cx:92, cy:VIEW_H-92, r:72, lastPointerAngle:0 };
    this.wheelAngle = 0; // persistent wheel position
    this.wheelMaxAngle = 165;
    this.driveSpeed = 0;

    this.dragPan = { active:false, id:null, startX:0, startY:0, camX:0, camY:0 };
    this.pinch = { active:false, ids:[], startDist:0, startZoom:1 };
    this.cameraDetached = false;
    this.starting = false;

    this.audioReady = false;
    this.audioCtx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.audioUnlocked = false;
    this.preferMediaAudio = false;
    this.mediaAudio = null;
    this.hornCooldownUntil = 0;
    this.finished = false;
    this.hornLoop = null;
  }

  create(){
    document.title = 'Tadi Autá 4';
    this.input.addPointer(5);

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
    this.uiTitle = this.add.text(VIEW_W/2, 18, 'Tadi Autá 4', { fontSize:'18px', fontStyle:'bold', color:COLORS.text }).setOrigin(0.5).setScrollFactor(0).setDepth(900);
    this.uiMoney = this.add.text(12, 46, 'Peníze: 0', { fontSize:'16px', color:COLORS.text }).setScrollFactor(0).setDepth(900);
    this.uiInfo = this.add.text(12, 68, '', { fontSize:'13px', color:'#d0e7ff' }).setScrollFactor(0).setDepth(900);
    this.btnBackMenuBg = this.add.rectangle(VIEW_W-52, 52, 84, 30, 0x15334f, 1).setStrokeStyle(2, 0x86C0FF, 0.95).setInteractive({ useHandCursor:true }).setScrollFactor(0).setDepth(902);
    this.btnBackMenu = this.add.text(VIEW_W-52, 52, '← menu', {
      fontSize:'15px', color:'#d8ebff', fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(903);
    this.btnBackMenuBg.on('pointerdown', ()=> this.returnToMenu());
  }

  buildControls(){
    this.gasBtn = this.add.circle(VIEW_W-82, VIEW_H-84, 54, 0x0c1117, 0.38).setInteractive().setScrollFactor(0).setDepth(1000);
    this.gasInner = this.add.circle(VIEW_W-82, VIEW_H-84, 38, 0x39d84d, 1).setScrollFactor(0).setDepth(1001);
    this.gasTxt = this.add.text(VIEW_W-82, VIEW_H-84, '↑', { fontSize:'28px', color:'#08250d' }).setOrigin(0.5).setScrollFactor(0).setDepth(1002);
    this.revBtn = this.add.circle(VIEW_W-82, VIEW_H-170, 32, 0x0c1117, 0.34).setInteractive().setScrollFactor(0).setDepth(1000);
    this.revInner = this.add.circle(VIEW_W-82, VIEW_H-170, 22, 0xb7c0cb, 1).setScrollFactor(0).setDepth(1001);
    this.revTxt = this.add.text(VIEW_W-82, VIEW_H-170, '↓', { fontSize:'18px', color:'#142434', fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(1002);
    this.hornBtn = this.add.circle(VIEW_W/2, VIEW_H-108, 28, 0x0c1117, 0.36).setInteractive().setScrollFactor(0).setDepth(1000);
    this.hornInner = this.add.circle(VIEW_W/2, VIEW_H-108, 19, 0xffd04f, 1).setScrollFactor(0).setDepth(1001);
    this.hornTxt = this.add.text(VIEW_W/2, VIEW_H-108, '📣', { fontSize:'18px' }).setOrigin(0.5).setScrollFactor(0).setDepth(1002);

    this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x0c1117, 0.40).setScrollFactor(0).setDepth(1000);
    this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r-10, 0xffffff, 0.08).setScrollFactor(0).setDepth(1001);
    this.wheelSpokes = this.add.graphics().setScrollFactor(0).setDepth(1001);
    this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r-14), 11, 0xffffff, 0.22).setScrollFactor(0).setDepth(1002);
    this.renderWheelVisual();

    this.gasBtn.on('pointerdown', (p)=> {
      if (this.state !== 'playing') return;
      this.unlockAudioOnGesture();
      this.resumeAudio();
      this.touch.gas = true;
      this.touch.gasId = p.id;
      this.resumeCameraFollow();
      this.startEngineSound();
    });
    this.revBtn.on('pointerdown', (p)=> {
      if (this.state !== 'playing') return;
      this.unlockAudioOnGesture();
      this.resumeAudio();
      this.touch.reverse = true;
      this.touch.reverseId = p.id;
      this.resumeCameraFollow();
      this.startEngineSound();
    });
    this.hornBtn.on('pointerdown', (p)=> {
      if (this.state !== 'playing') return;
      this.unlockAudioOnGesture();
      this.resumeAudio();
      this.touch.horn = true;
      this.touch.hornId = p.id;
      this.playHorn(true);
      this.startHornLoop();
    });
    const releaseGas = (p)=>{
      if (!p || this.touch.gasId === null || p.id === this.touch.gasId){
        this.touch.gas = false;
        this.touch.gasId = null;
      }
      if (!this.touch.gas && !this.touch.reverse) this.stopEngineSound();
    };
    const releaseReverse = (p)=>{
      if (!p || this.touch.reverseId === null || p.id === this.touch.reverseId){
        this.touch.reverse = false;
        this.touch.reverseId = null;
      }
      if (!this.touch.gas && !this.touch.reverse) this.stopEngineSound();
    };
    const releaseHorn = (p)=>{
      if (!p || this.touch.hornId === null || p.id === this.touch.hornId){
        this.touch.horn = false;
        this.touch.hornId = null;
        this.stopHornLoop();
      }
    };
    this.gasBtn.on('pointerup', releaseGas);
    this.gasBtn.on('pointerout', releaseGas);
    this.revBtn.on('pointerup', releaseReverse);
    this.revBtn.on('pointerout', releaseReverse);
    this.hornBtn.on('pointerup', releaseHorn);
    this.hornBtn.on('pointerout', releaseHorn);
  }

  installInputHandlers(){
    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.on('pointerdown', ()=>{ this.unlockAudioOnGesture(); this.resumeAudio(); });

    this.input.on('pointerdown', (p)=>{
      this.unlockAudioOnGesture();
      this.resumeAudio();
      if (this.state === 'playing') {
        const dx = p.x - this.wheel.cx;
        const dy = p.y - this.wheel.cy;
        if (Math.hypot(dx,dy) <= this.wheel.r){
          this.ensureAudio();
          this.wheel.active = true;
          this.wheel.id = p.id;
          this.wheel.lastPointerAngle = Phaser.Math.RadToDeg(Math.atan2(p.y - this.wheel.cy, p.x - this.wheel.cx)) + 90;
          this.resumeCameraFollow();
          this.updateWheelFromPointer(p);
          return;
        }
      }

      if (this.state !== 'playing') return;

      const active = this.input.manager.pointers.filter(pp => pp.isDown);
      if (active.length >= 2) {
        const [a, b] = active;
        if (!this.isInControlZone(a) && !this.isInControlZone(b)) {
          this.beginPinch(a, b);
          return;
        }
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
        if (!this.isInControlZone(a) && !this.isInControlZone(b)) {
          this.updatePinch(a,b);
          return;
        }
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
      }
      if (!p || this.touch.reverseId === null || p.id === this.touch.reverseId){
        this.touch.reverse = false;
        this.touch.reverseId = null;
      }
      if (!this.touch.gas && !this.touch.reverse) this.stopEngineSound();

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
      }
      if (!p || this.touch.reverseId === null || p.id === this.touch.reverseId){
        this.touch.reverse = false;
        this.touch.reverseId = null;
      }
      if (!this.touch.gas && !this.touch.reverse) this.stopEngineSound();
      if (!p || this.touch.hornId === null || p.id === this.touch.hornId){
        this.touch.horn = false;
        this.touch.hornId = null;
        this.stopHornLoop();
      }
    });
  }


  isInControlZone(p){
    const inWheel = Phaser.Math.Distance.Between(p.x, p.y, this.wheel.cx, this.wheel.cy) <= this.wheel.r + 20;
    const inGas = Phaser.Math.Distance.Between(p.x, p.y, VIEW_W-82, VIEW_H-84) <= 62;
    const inRev = Phaser.Math.Distance.Between(p.x, p.y, VIEW_W-82, VIEW_H-170) <= 42;
    const inHorn = Phaser.Math.Distance.Between(p.x, p.y, VIEW_W/2, VIEW_H-108) <= 36;
    return inWheel || inGas || inRev || inHorn;
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
    const dx = clamp(p.x - this.wheel.cx, -this.wheel.r, this.wheel.r);
    const norm = dx / this.wheel.r;
    this.wheelAngle = clamp(norm * this.wheelMaxAngle, -this.wheelMaxAngle, this.wheelMaxAngle);
    this.steer = this.wheelAngle / this.wheelMaxAngle;
    if (this.state === 'playing' && this.car){
      this.car.rotation = Phaser.Math.DegToRad(this.wheelAngle);
      if (this.car.body){
        this.car.body.setAngularVelocity(0);
        if (!this.touch.gas && !this.touch.reverse) this.car.body.setVelocity(0,0);
      }
      if (!this.finished) this.resumeCameraFollow();
    }
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

    add(this.add.text(w/2, 398, 'MAPY', { fontSize:'16px', fontStyle:'bold', color:COLORS.subtext }).setOrigin(0.5).setScrollFactor(0).setDepth(2001));
    this.mapStageLink = add(this.add.text(w/2, 420, 'Svetadiely', { fontSize:'12px', color:'#cfe8ff', backgroundColor:'#15334f', padding:{left:8,right:8,top:3,bottom:3}, fontStyle:'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(2002).setInteractive({ useHandCursor:true }));
    this.mapStageLink.on('pointerdown', ()=> { this.mapStage = 'continents'; this.refreshMenuVisuals(); });

    this.mapPanel = this.add.container(w/2, 525).setScrollFactor(0).setDepth(2002);
    this.menuRoot.add(this.mapPanel);
    const panelBorder = this.add.rectangle(0, 0, 284, 164, 0x2E7ED3, 1).setStrokeStyle(2, COLORS.cardBorder, 0.95);
    this.mapPanel.add(panelBorder);

    this.worldView = this.add.container(0,0);
    const worldImg = this.add.image(0,0,'atlas_world');
    const europeHit = this.add.zone(0,-28,70,54).setInteractive({ useHandCursor:true });
    europeHit.on('pointerdown', ()=> { this.mapStage = 'europe'; this.refreshMenuVisuals(); });
    const europeTag = this.add.text(0,-60,'Európa',{ fontSize:'12px', color:'#fff7bf', fontStyle:'bold', backgroundColor:'#1b4d78', padding:{left:4,right:4,top:2,bottom:2} }).setOrigin(0.5);
    const europeGlow = this.add.graphics();
    europeGlow.lineStyle(2, 0xffef92, 1).strokeEllipse(0,-28,64,46);
    const locks = [];
    [
      {x:-90,y:-18,t:'S. Amerika'}, {x:-56,y:34,t:'J. Amerika'}, {x:100,y:-42,t:'Ázia'}, {x:82,y:28,t:'Afrika'}, {x:118,y:58,t:'Austrália'}
    ].forEach(v=>{ locks.push(this.add.text(v.x,v.y,'🔒',{fontSize:'16px'}).setOrigin(0.5)); locks.push(this.add.text(v.x,v.y+16,v.t,{fontSize:'9px',color:'#d6e6ff'}).setOrigin(0.5)); });
    this.worldView.add([worldImg, europeGlow, europeHit, europeTag, ...locks]);
    this.mapPanel.add(this.worldView);

    this.europeView = this.add.container(0,0);
    const europeImg = this.add.image(0,0,'atlas_europe');
    const slGlow = this.add.graphics();
    slGlow.lineStyle(3, 0xffef92, 1).strokeCircle(26, 28, 16);
    const slHit = this.add.zone(26, 28, 42, 42).setInteractive({ useHandCursor:true });
    slHit.on('pointerdown', ()=> { this.unlockAudioOnGesture(); this.selectedMap = MAPS.si; this.refreshMenuVisuals(); this.startGame(); });
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
    [this.wheelBase, this.wheelRing, this.wheelSpokes, this.wheelKnob, this.gasBtn, this.gasInner, this.gasTxt, this.revBtn, this.revInner, this.revTxt, this.hornBtn, this.hornInner, this.hornTxt].forEach(o=>o.setVisible(playing));
    this.btnBackMenuBg.setVisible(playing);
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
    this.finishFlag = this.add.image(fx, fy-8, this.getFlagTextureKey()).setScale(0.72); this.landLayer.add(this.finishFlag);
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
      this.touch.reverse = false; this.touch.reverseId = null;
      this.touch.horn = false; this.touch.hornId = null;
      this.stopHornLoop();
      this.stopEngineSound();
      this.finished = false;
    this.hornLoop = null;
      this.driveSpeed = 0;
      this.buildWorld(this.selectedMap);
      this.setState('playing');
    } finally { this.starting = false; }
  }

  returnToMenu(){
    this.touch.gas = false;
    this.touch.gasId = null;
    this.touch.reverse = false;
    this.touch.reverseId = null;
    this.touch.horn = false;
    this.touch.hornId = null;
    this.stopHornLoop();
    this.wheel.active = false;
    this.wheel.id = null;
    this.dragPan.active = false;
    this.dragPan.id = null;
    this.pinch.active = false;
    this.pinch.ids = [];
    this.stopEngineSound();
    this.driveSpeed = 0;
    if (this.car && this.car.body){
      this.car.body.setVelocity(0,0);
      this.car.body.setAngularVelocity(0);
    }
    this.cameras.main.stopFollow();
    this.cameras.main.setScroll(0,0);
    this.cameras.main.zoom = 1;
    this.clearWorld();
    this.setState('menu');
    this.refreshMenuVisuals();
  }

  onCrash(){
    if (this.state !== 'playing') return;
    this.money = Math.max(0, this.money - 10);
    this.uiInfo.setText('💥 Náraz');
  }

  onFinish(){
    if (this.state !== 'playing' || this.finished) return;
    this.finished = true;
    if (this.finishZone){ this.finishZone.destroy(); this.finishZone = null; }
    this.money += 100;
    this.best = Math.max(this.best, this.money);
    this.uiInfo.setText(`🏁 CÍL! Peníze: ${this.money} (best: ${this.best})`);
    this.playWinTune();
    this.spawnFireworks();
    this.shakeAndRipple(420, 0.006);
    this.driveSpeed = 0;
    if (this.car && this.car.body){ this.car.body.setVelocity(0,0); this.car.body.setAngularVelocity(0); }
    this.touch.gas = false; this.touch.gasId = null;
    this.touch.reverse = false; this.touch.reverseId = null;
    this.touch.horn = false; this.touch.hornId = null;
    this.stopHornLoop();
    this.stopEngineSound();
  }

  update(_time, delta){
    this.uiMoney.setText(`Peníze: ${this.money}`);
    if (this.state !== 'playing' || !this.car) return;
    if (this.finished){ this.stopEngineSound(); return; }

    const gas = this.touch.gas || this.cursors.up.isDown;
    const reverse = this.touch.reverse || this.cursors.down.isDown;
    const kbSteer = (this.cursors.left.isDown ? -1 : 0) + (this.cursors.right.isDown ? 1 : 0);
    const steer = this.wheel.active || Math.abs(this.steer) > 0.001 ? this.steer : kbSteer;
    const dt = Math.min(delta / 1000, 0.033);
    const driving = gas || reverse;

    if (driving){
      this.resumeCameraFollow();
    }

    if (Math.abs(kbSteer) > 0.02){
      this.car.rotation += Phaser.Math.DegToRad(kbSteer * 150 * dt * (reverse ? -1 : 1));
    }

    const accel = this.selectedCar.accel || 520;
    const brake = accel * 1.45;
    if (gas){
      this.driveSpeed = Math.min(this.selectedCar.maxSpeed, this.driveSpeed + accel * dt);
    } else if (reverse){
      this.driveSpeed = Math.max(-this.selectedCar.maxSpeed * 0.45, this.driveSpeed - accel * dt);
    } else {
      if (this.driveSpeed > 0) this.driveSpeed = Math.max(0, this.driveSpeed - brake * dt);
      else if (this.driveSpeed < 0) this.driveSpeed = Math.min(0, this.driveSpeed + brake * dt);
    }

    const vx = Math.cos(this.car.rotation - Math.PI/2) * this.driveSpeed;
    const vy = Math.sin(this.car.rotation - Math.PI/2) * this.driveSpeed;
    this.car.body.setVelocity(vx, vy);

    if (driving) this.startEngineSound();
    else if (Math.abs(this.driveSpeed) < 1) this.stopEngineSound();
    this.updateEngineSound(Math.abs(this.driveSpeed), driving);
  }

  forwardSpeed(){
    if (!this.car || !this.car.body) return 0;
    const heading = new Phaser.Math.Vector2(Math.cos(this.car.rotation - Math.PI/2), Math.sin(this.car.rotation - Math.PI/2));
    return this.car.body.velocity.x * heading.x + this.car.body.velocity.y * heading.y;
  }

  startHornLoop(){
    this.stopHornLoop();
    this.playHorn(true);
    this.shakeAndRipple(120, 0.0028);
    this.hornLoop = this.time.addEvent({
      delay: 180,
      loop: true,
      callback: ()=>{
        if (!this.touch.horn) { this.stopHornLoop(); return; }
        this.playHorn(true);
        this.shakeAndRipple(120, 0.0028);
      }
    });
  }

  stopHornLoop(){
    if (this.hornLoop){ this.hornLoop.remove(false); this.hornLoop = null; }
  }

  shakeAndRipple(duration=180, intensity=0.0035){
    if (this.cameras?.main) this.cameras.main.shake(duration, intensity, true);
    const g = this.add.graphics().setScrollFactor(0).setDepth(1500);
    const cx = VIEW_W/2, cy = VIEW_H/2;
    const ripple = { r: 20, a: 0.28 };
    const draw = ()=>{
      g.clear();
      g.lineStyle(6, 0xffffff, ripple.a); g.strokeCircle(cx, cy, ripple.r);
      g.lineStyle(3, 0x7fc8ff, ripple.a * 0.8); g.strokeCircle(cx, cy, ripple.r * 0.72);
    };
    draw();
    this.tweens.add({ targets:ripple, r:Math.max(VIEW_W, VIEW_H)*0.8, a:0, duration, ease:'Cubic.easeOut', onUpdate:draw, onComplete:()=>g.destroy() });
  }

  playHorn(looping=false){
    const now = this.time.now || 0;
    if (!looping && now < this.hornCooldownUntil) return;
    if (!looping) this.hornCooldownUntil = now + 220;
    if (!this.audioCtx && this.preferMediaAudio && this.mediaAudio?.horn){
      try {
        const a = this.mediaAudio.horn.cloneNode();
        a.volume = 0.95;
        a.play().catch(()=>{});
      } catch(e){}
      return;
    }
    if (!this.audioCtx) return;
    this.resumeAudio();
    const t = this.audioCtx.currentTime + 0.01;
    [392, 330].forEach((f, i)=>{
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, t);
      osc.connect(gain); gain.connect(this.audioCtx.destination);
      const tt = t + i*0.03;
      gain.gain.setValueAtTime(0.0001, tt);
      gain.gain.exponentialRampToValueAtTime(0.09, tt + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, tt + 0.42);
      osc.start(tt); osc.stop(tt + 0.45);
    });
  }

  spawnFireworks(){
    const x = this.finishFlag ? this.finishFlag.x : (this.car ? this.car.x : VIEW_W/2);
    const y = this.finishFlag ? this.finishFlag.y - 12 : (this.car ? this.car.y - 40 : VIEW_H/2);
    const colors = [0xff595e,0xffca3a,0x8ac926,0x1982c4,0xff99dd,0xffffff];
    for (let burst=0; burst<3; burst++){
      this.time.delayedCall(burst * 180, ()=>{
        for (let i=0;i<22;i++){
          const ang = (Math.PI*2*i)/22 + Math.random()*0.18;
          const speed = 70 + Math.random()*110;
          const dot = this.add.circle(x, y, 3 + Math.random()*2, colors[(i+burst)%colors.length], 1).setDepth(1400);
          this.tweens.add({
            targets: dot,
            x: x + Math.cos(ang)*speed,
            y: y + Math.sin(ang)*speed,
            alpha: 0,
            scale: 0.4,
            duration: 800 + Math.random()*250,
            ease:'Cubic.easeOut',
            onComplete: ()=> dot.destroy()
          });
        }
      });
    }
  }

  ensureAudio(){
    if (!this.audioReady) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        try { this.audioCtx = new Ctx({ latencyHint:'interactive' }); } catch(e) {}
      }
      if (!this.audioCtx) this.preferMediaAudio = true;
      this.audioReady = true;
    }
    if (!this.mediaAudio) this.prepareMediaAudio();
  }

  prepareMediaAudio(){
    this.mediaAudio = {
      taxi: this.makeAudioEl(this.makeEngineDataUri(72)),
      auto: this.makeAudioEl(this.makeEngineDataUri(96)),
      motorka: this.makeAudioEl(this.makeEngineDataUri(168)),
      horn: this.makeAudioEl(this.makeHornDataUri()),
      win: this.makeAudioEl(this.makeWinDataUri())
    };
    ['taxi','auto','motorka'].forEach(k=>{ this.mediaAudio[k].loop = true; this.mediaAudio[k].preload = 'auto'; });
  }

  makeAudioEl(src){
    const a = new Audio(src);
    a.preload = 'auto';
    a.playsInline = true;
    a.setAttribute('playsinline','');
    a.crossOrigin = 'anonymous';
    return a;
  }

  floatTo16BitPCM(view, offset, input){
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
  }

  encodeWav(samples, sampleRate=22050){
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (off, str)=>{ for (let i=0;i<str.length;i++) view.setUint8(off+i, str.charCodeAt(i)); };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    this.floatTo16BitPCM(view, 44, samples);
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunk));
    return 'data:audio/wav;base64,' + btoa(binary);
  }

  makeEngineDataUri(baseHz){
    const sr = 22050, dur = 1.2, n = Math.floor(sr * dur), data = new Float32Array(n);
    for (let i=0;i<n;i++){
      const t = i / sr;
      const f = baseHz * (1 + 0.06*Math.sin(2*Math.PI*3*t));
      const s = Math.sin(2*Math.PI*f*t) * 0.58 + Math.sin(2*Math.PI*f*2*t) * 0.22 + Math.sin(2*Math.PI*f*3*t) * 0.12;
      data[i] = Math.tanh(s * 0.9) * 0.45;
    }
    return this.encodeWav(data, sr);
  }

  makeHornDataUri(){
    const sr = 22050, dur = 0.55, n = Math.floor(sr * dur), data = new Float32Array(n);
    for (let i=0;i<n;i++){
      const t = i / sr;
      const env = Math.max(0, 1 - t / dur);
      const s = Math.sin(2*Math.PI*392*t) * 0.5 + Math.sin(2*Math.PI*311*t) * 0.35;
      data[i] = Math.tanh(s) * env * 0.7;
    }
    return this.encodeWav(data, sr);
  }

  makeWinDataUri(){
    const sr = 22050, dur = 2.2, n = Math.floor(sr * dur), data = new Float32Array(n);
    const notes = [523.25,659.25,783.99,1046.5,1318.5];
    const times = [0,0.18,0.36,0.58,0.82,1.06,1.30,1.56];
    for (let i=0;i<n;i++){
      const t = i / sr;
      let s = 0;
      for (let k=0;k<times.length;k++){
        const start = times[k], end = start + 0.16;
        if (t >= start && t <= end){
          const env = Math.sin(Math.PI * ((t-start)/(end-start)));
          const f = notes[k % notes.length];
          s += (Math.sin(2*Math.PI*f*t) * 0.65 + Math.sin(2*Math.PI*f*2*t) * 0.18) * env;
        }
      }
      const burstStarts = [1.22,1.44,1.66,1.88];
      burstStarts.forEach((bs, idx)=>{
        const bd = 0.12;
        if (t >= bs && t <= bs + bd){
          const env = 1 - ((t-bs)/bd);
          s += (Math.random()*2 - 1) * env * (0.18 + idx*0.02);
        }
      });
      data[i] = Math.max(-1, Math.min(1, s * 0.42));
    }
    return this.encodeWav(data, sr);
  }

  tryUnlockMediaAudio(){
    if (!this.mediaAudio) return;
    Object.values(this.mediaAudio).forEach(a=>{
      try {
        a.muted = true;
        a.currentTime = 0;
        const p = a.play();
        if (p && p.then) p.then(()=>{ a.pause(); a.currentTime = 0; a.muted = false; }).catch(()=>{ a.muted = false; });
        else { a.pause(); a.currentTime = 0; a.muted = false; }
      } catch(e){}
    });
  }

  unlockAudioOnGesture(){
    this.ensureAudio();
    this.tryUnlockMediaAudio();
    if (!this.audioCtx) return;
    try {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const t = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 220;
      gain.gain.value = 0.00001;
      osc.connect(gain); gain.connect(this.audioCtx.destination);
      osc.start(t); osc.stop(t + 0.03);
      this.audioUnlocked = true;
    } catch(e) {}
  }

  resumeAudio(){
    if (this.audioCtx) {
      try { if (this.audioCtx.state === 'suspended') this.audioCtx.resume(); } catch(e) {}
    }
  }

  currentEngineAudio(){
    if (!this.mediaAudio) return null;
    const id = this.selectedCar?.id || 'auto';
    return this.mediaAudio[id] || this.mediaAudio.auto;
  }

  startEngineSound(){
    this.unlockAudioOnGesture();
    if (!this.audioCtx && this.preferMediaAudio){
      const a = this.currentEngineAudio();
      if (!a) return;
      if (this.activeEngineAudio && this.activeEngineAudio !== a){ try { this.activeEngineAudio.pause(); this.activeEngineAudio.currentTime = 0; } catch(e){} }
      this.activeEngineAudio = a;
      try {
        a.loop = true;
        a.volume = this.selectedCar?.engineGain || 0.06;
        if (a.paused) a.play().catch(()=>{});
      } catch(e){}
    }
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    if (this.engineOsc) return;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const filter = this.audioCtx.createBiquadFilter();
    osc.type = this.selectedCar?.id === 'motorka' ? 'square' : (this.selectedCar?.id === 'taxi' ? 'sawtooth' : 'triangle');
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    osc.frequency.value = this.selectedCar?.engineBase || 90;
    gain.gain.value = 0.0001;
    osc.connect(filter); filter.connect(gain); gain.connect(this.audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime((this.selectedCar?.engineGain || 0.045), this.audioCtx.currentTime + 0.015);
    this.engineOsc = osc; this.engineGain = gain; this.engineFilter = filter;
  }

  updateEngineSound(speed, gas){
    const s = clamp((speed || 0) / (this.selectedCar?.maxSpeed || 240), 0, 1);
    if (!this.audioCtx && this.preferMediaAudio){
      const a = this.currentEngineAudio();
      if (a){
        try {
          a.playbackRate = (this.selectedCar?.id === 'motorka' ? 1.4 : 0.85) + s * (this.selectedCar?.id === 'motorka' ? 1.3 : 0.55);
          a.volume = gas ? (this.selectedCar?.engineGain || 0.06) * 1.1 : (this.selectedCar?.engineGain || 0.06) * 0.72;
        } catch(e){}
      }
    }
    if (!this.engineOsc || !this.audioCtx) return;
    const t = this.audioCtx.currentTime;
    const base = this.selectedCar?.engineBase || 90;
    const top = this.selectedCar?.engineTop || 210;
    const gainAmt = (this.selectedCar?.engineGain || 0.045) * (this.preferMediaAudio ? 0.1 : 1);
    this.engineOsc.frequency.setTargetAtTime(base + s * (top - base) + (gas ? 18 : 8), t, 0.015);
    if (this.engineFilter) this.engineFilter.frequency.setTargetAtTime(320 + s * 1000, t, 0.02);
    if (this.engineGain) this.engineGain.gain.setTargetAtTime(gas ? gainAmt : gainAmt * 0.65, t, 0.02);
  }

  stopEngineSound(){
    if (this.activeEngineAudio){
      try { this.activeEngineAudio.pause(); this.activeEngineAudio.currentTime = 0; } catch(e) {}
      this.activeEngineAudio = null;
    }
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
    if (!this.audioCtx && this.preferMediaAudio && this.mediaAudio?.win){
      [0, 520, 1040].forEach((d)=>{
        this.time.delayedCall(d, ()=>{ try { const a = this.mediaAudio.win.cloneNode(); a.volume = 0.95; a.play().catch(()=>{}); } catch(e){} });
      });
      return;
    }
    if (!this.audioCtx) return;
    this.resumeAudio();
    [0, 0.62, 1.24].forEach((rep)=>{
      const start = this.audioCtx.currentTime + 0.02 + rep;
      const melody = [
        [523.25,0.00,0.10,'triangle',0.07],
        [659.25,0.10,0.10,'triangle',0.07],
        [783.99,0.20,0.12,'triangle',0.07],
        [1046.5,0.34,0.14,'triangle',0.075],
        [1318.5,0.50,0.18,'sine',0.082]
      ];
      melody.forEach(([freq,off,dur,wave,peak])=>{
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, start + off);
        osc.connect(gain); gain.connect(this.audioCtx.destination);
        gain.gain.value = 0.0001;
        const t0 = start + off;
        osc.start(t0);
        gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
        gain.gain.setTargetAtTime(peak * 0.4, t0 + dur * 0.35, 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.stop(t0 + dur + 0.03);
      });
    });
  }

  makeCarTexture(key, w, h, bodyColor, stripeColor, moto=false){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    if (moto){
      g.fillStyle(0x111111, 1).fillCircle(w * 0.35, h * 0.78, 8).fillCircle(w * 0.65, h * 0.78, 8);
      g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.36, h * 0.16, w * 0.28, h * 0.52, 10);
      g.fillStyle(stripeColor, 0.95).fillRect(w * 0.44, h * 0.22, w * 0.12, h * 0.24);
      g.fillStyle(0x7fc8ff, 0.92).fillRoundedRect(w * 0.39, h * 0.56, w * 0.22, h * 0.10, 5);
      g.lineStyle(4, 0x333333, 1).lineBetween(w * 0.28, h * 0.32, w * 0.72, h * 0.32).lineBetween(w * 0.36, h * 0.68, w * 0.64, h * 0.68);
      g.fillStyle(0xfff2a3, 0.95).fillCircle(w * 0.50, h * 0.18, 5);
    } else {
      g.fillStyle(0x111111, 1).fillCircle(w * 0.23, h * 0.2, 8).fillCircle(w * 0.77, h * 0.2, 8).fillCircle(w * 0.23, h * 0.8, 8).fillCircle(w * 0.77, h * 0.8, 8);
      g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.18, h * 0.08, w * 0.64, h * 0.84, 16);
      g.fillStyle(0x7fc8ff, 0.92).fillRoundedRect(w * 0.28, h * 0.60, w * 0.44, h * 0.14, 8);
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
    g.generateTexture(key, w, h); g.destroy();
  }

  getFlagTextureKey(){
    return this.selectedMap?.id === 'si' ? 'tex_flag_si' : 'tex_flag_si';
  }

  makeFlagTexture(){
    if (this.textures.exists('tex_flag_si')) return;
    const g = this.add.graphics();
    g.lineStyle(3, 0xffffff, 1); g.lineBetween(8, 34, 8, 4);
    g.fillStyle(0xffffff,1).fillRoundedRect(10, 6, 22, 15, 4);
    g.fillStyle(0x3a87ff,1).fillRect(10, 6, 22, 5);
    g.fillStyle(0xff5959,1).fillRect(10, 16, 22, 5);
    g.clear();
    g.lineStyle(3, 0xffffff, 1); g.lineBetween(8, 34, 8, 4);
    g.fillStyle(0xffffff,1).fillRoundedRect(10, 6, 22, 15, 4);
    g.fillStyle(0xffffff,1).fillRect(10, 6, 22, 5);
    g.fillStyle(0x3a87ff,1).fillRect(10, 11, 22, 5);
    g.fillStyle(0xff5959,1).fillRect(10, 16, 22, 5);
    g.generateTexture('tex_flag_si', 40, 40); g.destroy();
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

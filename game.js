const VIEW_W = 390;
const VIEW_H = 780;
const CELL = 44;

const CARS = [
  { id:"taxi",    name:"Taxi",    color:0xffd800, stripe:0x111111, maxSpeed:230, accel:520, widthMul:0.95, heightMul:1.0 },
  { id:"moto",    name:"Motorka", color:0xff4fa3, stripe:0xffffff, maxSpeed:280, accel:560, widthMul:0.58, heightMul:0.84 },
  { id:"car",     name:"Auto",    color:0xf6f6f6, stripe:0x2c7be5, maxSpeed:240, accel:520, widthMul:1.0, heightMul:1.0 }
];

const RULES = { finishReward: 100, crashPenalty: 10 };

const MAPS = {
  si: { id:"si", name:"Slovinsko", grid: [
    "........................",
    "........................",
    "......###########.......",
    ".....##############.....",
    "....################....",
    "...##################...",
    "..###################...",
    "..####################..",
    "..####################..",
    "..###################...",
    "...##################...",
    "....################....",
    ".....##############.....",
    "......###########.......",
    ".......#########........",
    "........#######.........",
    ".........#####..........",
    "..........###...........",
    "...........S............",
    "........................",
    "..............F.........",
    "........................",
    "........................",
    "........................"
  ]}
};

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t){ return a + (b - a) * t; }

class MainScene extends Phaser.Scene {
  constructor(){ super('main'); }

  init(){
    this.state = 'menu';
    this.money = 0;
    this.best = 0;
    this.carIndex = 0;
    this.selectedCar = CARS[this.carIndex];
    this.selectedMap = MAPS.si;

    this.touch = { gas:false };
    this.steer = 0;
    this.wheel = { active:false, id:null, cx:92, cy:VIEW_H - 92, r:62 };

    this.mapBrowse = { active:false, pointerId:null, lastX:0, lastY:0, pinch:false, idA:null, idB:null, startDist:0, startZoom:1 };
    this.manualCamera = true;
    this.gameStartedDriving = false;
    this.minZoom = 0.7;
    this.maxZoom = 2.2;
    this.finishedRound = false;
  }

  create(){
    this.createTextures();
    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.addPointer(3);

    this.buildHud();
    this.buildMenu();

    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);
    this.registerInputs();

    this.refreshMenuSelection();
    this.setState('menu');
  }

  createTextures(){
    this.makeTileTexture('tex_ocean', CELL, CELL, 0x3f86d9, 0x2a6fbe);
    this.makeTileTexture('tex_land', CELL, CELL, 0x61b15a, 0x4d9647);
    this.makeFinishFlagTexture('tex_finish', CELL, CELL);
    this.makeCarTexture('car_taxi', 60, 92, 0xffd800, 0x111111, false);
    this.makeCarTexture('car_moto', 40, 84, 0xff4fa3, 0xffffff, true);
    this.makeCarTexture('car_auto', 60, 92, 0xf6f6f6, 0x2c7be5, false);
    this.makeAtlasWorldTexture('atlas_world', 280, 150);
    this.makeEuropeTexture('atlas_europe', 280, 170);
  }

  buildHud(){
    this.uiTitle = this.add.text(VIEW_W/2, 16, 'Soferujeme 4', { fontSize:'20px', color:'#ffffff', fontStyle:'bold' })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(2000);

    this.uiMoney = this.add.text(12, 48, 'Peníze: 0', { fontSize:'16px', color:'#ffffff' })
      .setScrollFactor(0).setDepth(2000);

    this.uiInfo = this.add.text(12, 72, '', { fontSize:'14px', color:'#d9ecff', wordWrap:{ width: 270 } })
      .setScrollFactor(0).setDepth(2000);

    this.gasBtn = this.add.circle(VIEW_W - 72, VIEW_H - 92, 52, 0x0d1017, 0.55)
      .setInteractive().setScrollFactor(0).setDepth(2000);
    this.gasInner = this.add.circle(VIEW_W - 72, VIEW_H - 92, 40, 0x2bdc4a, 0.18)
      .setScrollFactor(0).setDepth(2001);
    this.gasTxt = this.add.text(VIEW_W - 72, VIEW_H - 92, '⛽', { fontSize:'28px', color:'#ffffff' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x0d1017, 0.60)
      .setScrollFactor(0).setDepth(2000);
    this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r - 10, 0xffffff, 0.08)
      .setScrollFactor(0).setDepth(2001);
    this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r - 14), 11, 0xffffff, 0.22)
      .setScrollFactor(0).setDepth(2002);

    this.gasBtn.on('pointerdown', ()=> this.touch.gas = true);
    this.gasBtn.on('pointerup', ()=> this.touch.gas = false);
    this.gasBtn.on('pointerout', ()=> this.touch.gas = false);
  }

  buildMenu(){
    const w = VIEW_W;
    this.menuRoot = this.add.container(0,0).setDepth(3000);

    const panel = this.add.rectangle(w/2, VIEW_H/2, w - 26, VIEW_H - 120, 0x07121d, 0.88)
      .setStrokeStyle(2, 0x295b8f, 0.9);
    const subtitle = this.add.text(w/2, 58, 'Vyber auto hore a mapu dole', { fontSize:'15px', color:'#b8d9ff' }).setOrigin(0.5,0);

    const carsLabel = this.add.text(w/2, 95, 'AUTÁ', { fontSize:'13px', color:'#7fb3ff', fontStyle:'bold' }).setOrigin(0.5,0);
    const mapsLabel = this.add.text(w/2, 330, 'MAPY', { fontSize:'13px', color:'#7fb3ff', fontStyle:'bold' }).setOrigin(0.5,0);

    this.carCards = [];
    CARS.forEach((car, i)=>{
      const x = 78 + i * 118;
      const y = 205;
      const card = this.add.container(x, y);
      const bg = this.add.rectangle(0,0, 88, 110, 0x5ea7ea, 1).setStrokeStyle(2, 0xbfdfff, 1).setInteractive({ useHandCursor:true });
      const imgKey = car.id === 'taxi' ? 'car_taxi' : car.id === 'moto' ? 'car_moto' : 'car_auto';
      const icon = this.add.image(0, -16, imgKey).setScale(0.48);
      const name = this.add.text(0, 36, car.name, { fontSize:'13px', color:'#08345f', fontStyle:'bold' }).setOrigin(0.5);
      const stat = this.add.text(0, 54, `max ${car.maxSpeed}`, { fontSize:'11px', color:'#0d4f8c' }).setOrigin(0.5);
      bg.on('pointerdown', ()=>{
        this.carIndex = i;
        this.selectedCar = CARS[i];
        this.refreshMenuSelection();
      });
      card.add([bg, icon, name, stat]);
      this.carCards.push({ card, bg });
      this.menuRoot.add(card);
    });

    this.worldMapWrap = this.add.container(w/2, 455);
    this.worldMapBg = this.add.rectangle(0, 0, 296, 160, 0x0a1724, 1).setStrokeStyle(2, 0x265582, 1);
    this.worldMapImage = this.add.image(0, 0, 'atlas_world');
    this.europeHit = this.add.zone(34, -6, 70, 58).setRectangleDropZone(70,58).setInteractive({ useHandCursor:true });
    this.europeOutline = this.add.rectangle(34, -6, 78, 64, 0x6fe27d, 0.10).setStrokeStyle(2, 0x8fff96, 1);
    this.europeLabel = this.add.text(34, 47, 'Európa', { fontSize:'12px', color:'#ffffff' }).setOrigin(0.5);
    this.worldMapWrap.add([this.worldMapBg, this.worldMapImage, this.europeOutline, this.europeLabel, this.europeHit]);

    this.europeWrap = this.add.container(w/2, 455);
    this.europeBg = this.add.rectangle(0, 0, 296, 176, 0x0a1724, 1).setStrokeStyle(2, 0x265582, 1);
    this.europeImage = this.add.image(0, 0, 'atlas_europe');
    this.sloveniaHit = this.add.zone(44, 34, 54, 28).setInteractive({ useHandCursor:true });
    this.sloveniaGlow = this.add.graphics();
    this.drawSloveniaOutline(this.sloveniaGlow, 44, 34, 0xfff0a0, 0xffd94d);
    this.siLabel = this.add.text(46, 58, 'Slovinsko', { fontSize:'11px', color:'#fff7bf' }).setOrigin(0.5);

    this.lockedMarks = [];
    [
      { x:-58, y:-18, name:'Francúzsko' },
      { x:15, y:-48, name:'Nemecko' },
      { x:84, y:-6, name:'Rumunsko' },
      { x:-5, y:34, name:'Taliansko' },
      { x:-88, y:-46, name:'Španielsko' }
    ].forEach((p)=>{
      const lock = this.add.text(p.x, p.y, '🔒', { fontSize:'18px' }).setOrigin(0.5);
      const nm = this.add.text(p.x, p.y + 18, p.name, { fontSize:'9px', color:'#d6e6ff' }).setOrigin(0.5);
      this.lockedMarks.push(lock, nm);
    });
    this.backToWorld = this.add.text(-112, -74, '← svetadiely', { fontSize:'11px', color:'#c6e6ff', backgroundColor:'#15334f', padding:{ left:6, right:6, top:3, bottom:3 } })
      .setInteractive({ useHandCursor:true });
    this.europeWrap.add([this.europeBg, this.europeImage, this.sloveniaGlow, this.siLabel, this.sloveniaHit, this.backToWorld, ...this.lockedMarks]);

    this.menuState = 'world';
    this.europeWrap.setVisible(false);

    this.mapHint = this.add.text(w/2, 563, 'Klikni na Európu a potom na Slovinsko', { fontSize:'12px', color:'#b8d9ff' }).setOrigin(0.5);
    this.selectionText = this.add.text(w/2, 598, '', { fontSize:'13px', color:'#ffffff', align:'center' }).setOrigin(0.5);

    this.btnStart = this.add.rectangle(w/2, 662, 220, 56, 0x2bdc4a, 1).setInteractive({ useHandCursor:true });
    this.btnStartTxt = this.add.text(w/2, 662, 'ŠTART', { fontSize:'22px', color:'#0c180e', fontStyle:'bold' }).setOrigin(0.5).setInteractive({ useHandCursor:true });

    this.europeHit.on('pointerdown', ()=>{
      this.menuState = 'europe';
      this.worldMapWrap.setVisible(false);
      this.europeWrap.setVisible(true);
      this.mapHint.setText('V Európe je zatiaľ odomknuté iba Slovinsko');
    });
    this.backToWorld.on('pointerdown', ()=>{
      this.menuState = 'world';
      this.worldMapWrap.setVisible(true);
      this.europeWrap.setVisible(false);
      this.mapHint.setText('Klikni na Európu a potom na Slovinsko');
    });
    this.sloveniaHit.on('pointerdown', ()=>{
      this.selectedMap = MAPS.si;
      this.refreshMenuSelection();
    });
    this.btnStart.on('pointerdown', ()=> this.startGame());
    this.btnStartTxt.on('pointerdown', ()=> this.startGame());

    this.menuRoot.add([
      panel, subtitle, carsLabel, mapsLabel,
      this.worldMapWrap, this.europeWrap, this.mapHint,
      this.selectionText, this.btnStart, this.btnStartTxt
    ]);
  }

  refreshMenuSelection(){
    this.carCards.forEach((entry, idx)=>{
      const selected = idx === this.carIndex;
      entry.bg.setFillStyle(selected ? 0x2e7ed3 : 0x5ea7ea, 1);
      entry.bg.setStrokeStyle( selected ? 3 : 2, selected ? 0xeaf5ff : 0xbfdfff, 1 );
    });
    const mapName = this.selectedMap ? this.selectedMap.name : '—';
    this.selectionText.setText(`Auto: ${this.selectedCar.name}   •   Mapa: ${mapName}`);
  }

  setState(state){
    this.state = state;
    const isMenu = state === 'menu';
    const isPlaying = state === 'playing';

    this.menuRoot.setVisible(isMenu);
    this.menuRoot.iterate(obj => {
      if (!obj || !obj.input) return;
      if (isMenu) obj.setInteractive(obj.input.hitArea ? { useHandCursor:true } : undefined);
      else obj.disableInteractive();
    });
    [this.btnStart, this.btnStartTxt, this.europeHit, this.backToWorld, this.sloveniaHit].forEach(obj=>{
      if (!obj) return;
      if (isMenu) obj.setInteractive({ useHandCursor:true });
      else obj.disableInteractive();
    });
    this.carCards.forEach(entry=>{
      if (isMenu) entry.bg.setInteractive({ useHandCursor:true });
      else entry.bg.disableInteractive();
    });

    [this.gasBtn, this.gasInner, this.gasTxt, this.wheelBase, this.wheelRing, this.wheelKnob, this.uiMoney, this.uiInfo].forEach(o=>o.setVisible(isPlaying));

    this.uiMoney.setText(`Peníze: ${this.money}`);
    this.uiTitle.setText('Soferujeme 4');
    if (!isPlaying) this.uiInfo.setText('');
  }

  registerInputs(){
    this.input.on('pointerdown', (p)=>{
      if (this.state !== 'playing') return;

      if (this.pointerInsideWheel(p)){
        this.wheel.active = true;
        this.wheel.id = p.id;
        this.updateWheelFromPointer(p);
        return;
      }

      if (this.isPointerOnGas(p)) return;

      if (this.manualCamera){
        if (!this.mapBrowse.active && !this.mapBrowse.pinch){
          this.mapBrowse.active = true;
          this.mapBrowse.pointerId = p.id;
          this.mapBrowse.lastX = p.x;
          this.mapBrowse.lastY = p.y;
        }
        this.updatePinchState();
      }
    });

    this.input.on('pointermove', (p)=>{
      if (this.state !== 'playing') return;

      if (this.wheel.active && p.id === this.wheel.id){
        this.updateWheelFromPointer(p);
        return;
      }

      if (!this.manualCamera) return;

      this.updatePinchState();
      if (this.mapBrowse.pinch){
        this.handlePinchZoom();
        return;
      }

      if (this.mapBrowse.active && p.id === this.mapBrowse.pointerId && p.isDown){
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - this.mapBrowse.lastX) / cam.zoom;
        cam.scrollY -= (p.y - this.mapBrowse.lastY) / cam.zoom;
        this.clampCameraToWorld();
        this.mapBrowse.lastX = p.x;
        this.mapBrowse.lastY = p.y;
      }
    });

    this.input.on('pointerup', (p)=>{
      this.touch.gas = false;
      if (this.wheel.active && p.id === this.wheel.id){
        this.releaseWheel();
      }
      if (this.mapBrowse.active && p.id === this.mapBrowse.pointerId){
        this.mapBrowse.active = false;
        this.mapBrowse.pointerId = null;
      }
      this.updatePinchState();
    });

    this.input.on('pointerupoutside', ()=>{
      this.touch.gas = false;
      this.releaseWheel();
      this.mapBrowse.active = false;
      this.mapBrowse.pointerId = null;
      this.mapBrowse.pinch = false;
    });
  }

  pointerInsideWheel(p){
    return Phaser.Math.Distance.Between(p.x, p.y, this.wheel.cx, this.wheel.cy) <= this.wheel.r;
  }

  isPointerOnGas(p){
    return Phaser.Math.Distance.Between(p.x, p.y, VIEW_W - 72, VIEW_H - 92) <= 52;
  }

  updateWheelFromPointer(p){
    const dx = p.x - this.wheel.cx;
    const dy = p.y - this.wheel.cy;
    const r = this.wheel.r - 14;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = dx / len;
    const ny = dy / len;
    this.wheelKnob.setPosition(this.wheel.cx + nx * r, this.wheel.cy + ny * r);
    this.steer = clamp(dx / this.wheel.r, -1, 1);
  }

  releaseWheel(){
    this.wheel.active = false;
    this.wheel.id = null;
    this.steer = 0;
    this.wheelKnob.setPosition(this.wheel.cx, this.wheel.cy - (this.wheel.r - 14));
  }

  updatePinchState(){
    const pointers = this.input.pointers.filter(ptr => ptr.isDown && !this.pointerInsideWheel(ptr) && !this.isPointerOnGas(ptr));
    if (this.manualCamera && pointers.length >= 2){
      const [a, b] = pointers;
      const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
      if (!this.mapBrowse.pinch){
        this.mapBrowse.pinch = true;
        this.mapBrowse.idA = a.id;
        this.mapBrowse.idB = b.id;
        this.mapBrowse.startDist = dist;
        this.mapBrowse.startZoom = this.cameras.main.zoom;
        this.mapBrowse.active = false;
      }
    } else {
      this.mapBrowse.pinch = false;
      this.mapBrowse.idA = null;
      this.mapBrowse.idB = null;
    }
  }

  handlePinchZoom(){
    const a = this.input.pointers.find(ptr => ptr.id === this.mapBrowse.idA);
    const b = this.input.pointers.find(ptr => ptr.id === this.mapBrowse.idB);
    if (!a || !b || !a.isDown || !b.isDown) return;
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    const cam = this.cameras.main;
    cam.setZoom(clamp(this.mapBrowse.startZoom * (dist / Math.max(1, this.mapBrowse.startDist)), this.minZoom, this.maxZoom));
    this.clampCameraToWorld();
  }

  clearWorld(){
    [this.landLayer, this.wallGroup, this.obstacles, this.finishZone, this.finishMarker, this.car].forEach(o=>{
      if (!o) return;
      if (o.destroy) o.destroy(true);
      else if (o.clear) o.clear(true, true);
    });
    this.landLayer = null;
    this.wallGroup = null;
    this.obstacles = null;
    this.finishZone = null;
    this.finishMarker = null;
    this.car = null;
  }

  normalizeGrid(grid){
    const cols = Math.max(...grid.map(s => s.length));
    return grid.map(line => line.padEnd(cols, '.'));
  }

  isLandChar(ch){ return ch === '#' || ch === 'S' || ch === 'F'; }

  findCell(grid, ch){
    for (let y = 0; y < grid.length; y++){
      for (let x = 0; x < grid[y].length; x++) if (grid[y][x] === ch) return { x, y };
    }
    return null;
  }

  findSafeLand(grid, avoid){
    const cells = [];
    for (let y = 1; y < grid.length - 1; y++){
      for (let x = 1; x < grid[y].length - 1; x++){
        if (!this.isLandChar(grid[y][x])) continue;
        let neighbors = 0;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{
          if (this.isLandChar(grid[y + dy]?.[x + dx])) neighbors++;
        });
        if (neighbors >= 2) cells.push({ x, y });
      }
    }
    if (!cells.length) return { x:1, y:1 };
    if (!avoid) return cells[0];
    cells.sort((a,b)=>{
      const da = Phaser.Math.Distance.Between(a.x, a.y, avoid.x, avoid.y);
      const db = Phaser.Math.Distance.Between(b.x, b.y, avoid.x, avoid.y);
      return db - da;
    });
    return cells[0];
  }

  buildWorld(mapDef){
    this.clearWorld();
    const grid = this.normalizeGrid(mapDef.grid);
    const rows = grid.length;
    const cols = grid[0].length;
    this.worldW = cols * CELL;
    this.worldH = rows * CELL;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.landLayer = this.add.container(0,0);
    this.wallGroup = this.physics.add.staticGroup();
    this.obstacles = this.physics.add.staticGroup();

    for (let y = 0; y < rows; y++){
      for (let x = 0; x < cols; x++){
        const cx = x * CELL + CELL/2;
        const cy = y * CELL + CELL/2;
        const isLand = this.isLandChar(grid[y][x]);
        const img = this.add.image(cx, cy, isLand ? 'tex_land' : 'tex_ocean');
        this.landLayer.add(img);
        if (!isLand){
          const wall = this.add.rectangle(cx, cy, CELL, CELL, 0x000000, 0);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        }
      }
    }

    let startCell = this.findCell(grid, 'S');
    if (!startCell || !this.isLandChar(grid[startCell.y][startCell.x])) startCell = this.findSafeLand(grid);

    let finishCell = this.findCell(grid, 'F');
    if (!finishCell || !this.isLandChar(grid[finishCell.y][finishCell.x])) finishCell = this.findSafeLand(grid, startCell);
    if (finishCell.x === startCell.x && finishCell.y === startCell.y) finishCell = this.findSafeLand(grid, { x:startCell.x + 3, y:startCell.y + 3 });

    const sx = startCell.x * CELL + CELL/2;
    const sy = startCell.y * CELL + CELL/2;
    const fx = finishCell.x * CELL + CELL/2;
    const fy = finishCell.y * CELL + CELL/2;

    const startMarker = this.add.rectangle(sx, sy, CELL * 0.86, 8, 0xffffff, 1);
    this.finishMarker = this.add.image(fx, fy, 'tex_finish').setDisplaySize(CELL * 0.92, CELL * 0.92);
    this.landLayer.add(startMarker);
    this.landLayer.add(this.finishMarker);

    this.finishZone = this.add.zone(fx, fy, CELL * 0.9, CELL * 0.9);
    this.physics.add.existing(this.finishZone, true);

    const landCells = [];
    for (let y = 1; y < rows - 1; y++){
      for (let x = 1; x < cols - 1; x++) if (grid[y][x] === '#') landCells.push({ x, y });
    }
    Phaser.Utils.Array.Shuffle(landCells);
    const obsCount = Math.min(7, Math.floor(landCells.length * 0.06));
    for (let i = 0; i < obsCount; i++){
      const c = landCells[i];
      if (!c) continue;
      if ((Math.abs(c.x - startCell.x) <= 1 && Math.abs(c.y - startCell.y) <= 1) || (Math.abs(c.x - finishCell.x) <= 1 && Math.abs(c.y - finishCell.y) <= 1)) continue;
      const ox = c.x * CELL + CELL/2;
      const oy = c.y * CELL + CELL/2;
      const rock = this.add.rectangle(ox, oy, 26, 26, 0x8b673f, 1).setRotation((i % 3) * 0.35);
      this.physics.add.existing(rock, true);
      this.obstacles.add(rock);
    }

    const tex = this.selectedCar.id === 'taxi' ? 'car_taxi' : this.selectedCar.id === 'moto' ? 'car_moto' : 'car_auto';
    const baseW = this.selectedCar.id === 'moto' ? 25 : 34;
    const baseH = this.selectedCar.id === 'moto' ? 42 : 54;
    this.car = this.physics.add.image(sx, sy, tex);
    this.car.setDisplaySize(baseW * (this.selectedCar.widthMul || 1), baseH * (this.selectedCar.heightMul || 1));
    this.car.body.setSize(baseW * (this.selectedCar.widthMul || 1), baseH * (this.selectedCar.heightMul || 1), true);
    this.car.setDrag(320, 320);
    this.car.setCollideWorldBounds(true);
    this.car.body.setMaxVelocity(this.selectedCar.maxSpeed, this.selectedCar.maxSpeed);
    this.car.body.setAngularVelocity(0);

    this.physics.add.collider(this.car, this.wallGroup, ()=> this.onCrash(), null, this);
    this.physics.add.collider(this.car, this.obstacles, ()=> this.onCrash(), null, this);
    this.physics.add.overlap(this.car, this.finishZone, ()=> this.onFinish(), null, this);

    const cam = this.cameras.main;
    cam.stopFollow();
    cam.setBounds(0, 0, this.worldW, this.worldH);
    cam.setZoom(1);
    cam.centerOn(sx, sy);
    this.clampCameraToWorld();
  }

  startGame(){
    this.mapHint.setText(this.menuState === 'europe' ? 'V Európe je zatiaľ odomknuté iba Slovinsko' : 'Klikni na Európu a potom na Slovinsko');
    this.money = 0;
    this.touch.gas = false;
    this.releaseWheel();
    this.manualCamera = true;
    this.gameStartedDriving = false;
    this.clearWorld();
    this.finishedRound = false;
    this.buildWorld(this.selectedMap);
    this.setState('playing');
    this.uiInfo.setText('');
    this.input.setDefaultCursor('default');
  }

  engageCarCamera(){
    if (!this.manualCamera || !this.car) return;
    this.manualCamera = false;
    this.mapBrowse.active = false;
    this.mapBrowse.pinch = false;
    this.cameras.main.pan(this.car.x, this.car.y, 180, 'Sine.easeOut', true);
    this.cameras.main.zoomTo(1, 180);
    this.time.delayedCall(185, ()=>{
      if (!this.car || this.state !== 'playing') return;
      this.cameras.main.startFollow(this.car, true, 0.14, 0.14);
      this.cameras.main.setDeadzone(36, 56);
    });
  }

  clampCameraToWorld(){
    const cam = this.cameras.main;
    const maxScrollX = Math.max(0, this.worldW - cam.width / cam.zoom);
    const maxScrollY = Math.max(0, this.worldH - cam.height / cam.zoom);
    cam.scrollX = clamp(cam.scrollX, 0, maxScrollX);
    cam.scrollY = clamp(cam.scrollY, 0, maxScrollY);
  }

  onCrash(){
    if (this.state !== 'playing') return;
    this.money = Math.max(0, this.money - RULES.crashPenalty);
    this.uiInfo.setText(`💥 Náraz -${RULES.crashPenalty}`);
  }

  playWinSound(){
    const ctx = this.sound.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.5, 880.0, 783.99, 659.25, 698.46, 783.99, 880.0, 1046.5, 1174.66];
    melody.forEach((freq, i)=>{
      const t = now + i * 0.42;
      ['triangle','sine'].forEach((type, layer)=>{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(layer === 0 ? freq : freq * 2, t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(layer === 0 ? 0.08 : 0.03, t + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.58);
      });
    });
  }

  onFinish(){
    if (this.state !== 'playing' || this.finishedRound) return;
    this.finishedRound = true;
    this.playWinSound();
    this.money += RULES.finishReward;
    this.best = Math.max(this.best, this.money);
    this.uiInfo.setText(`🏁 Cieľ! Peníze: ${this.money} • Best: ${this.best}`);
    this.cameras.main.stopFollow();
    if (this.car?.body){
      this.car.body.setVelocity(0, 0);
      this.car.body.setAngularVelocity(0);
      this.car.body.enable = false;
    }
    this.touch.gas = false;
    this.releaseWheel();
    this.manualCamera = true;
    this.gameStartedDriving = false;
    this.setState('menu');
    this.refreshMenuSelection();
    this.mapHint.setText('Hotovo! Auto ostalo v cieli. Môžeš zmeniť auto alebo stlačiť ŠTART znova');
  }

  update(){
    this.uiMoney.setText(`Peníze: ${this.money}`);
    if (this.state !== 'playing' || !this.car) return;

    const gas = this.touch.gas || this.cursors.up.isDown || this.input.pointers.some(p => p.isDown && this.isPointerOnGas(p));
    let kbSteer = 0;
    if (this.cursors.left.isDown) kbSteer -= 1;
    if (this.cursors.right.isDown) kbSteer += 1;

    let steer = clamp(this.steer + kbSteer, -1, 1);
    if (!this.wheel.active && kbSteer === 0){
      this.steer = lerp(this.steer, 0, 0.14);
      steer = this.steer;
      this.wheelKnob.setPosition(this.wheel.cx + this.steer * (this.wheel.r - 14), this.wheel.cy - (this.wheel.r - 14) * (1 - Math.abs(this.steer) * 0.18));
    }

    if ((gas || Math.abs(steer) > 0.12) && !this.gameStartedDriving){
      this.gameStartedDriving = true;
      this.engageCarCamera();
    }

    const speed = this.car.body.speed || 0;
    const speedN = clamp(speed / this.selectedCar.maxSpeed, 0, 1);
    const angVel = steer * 260 * speedN;
    this.car.body.setAngularVelocity(angVel);

    if (gas){
      const angleDeg = Phaser.Math.RadToDeg(this.car.rotation) - 90;
      const v = new Phaser.Math.Vector2();
      this.physics.velocityFromAngle(angleDeg, this.selectedCar.maxSpeed, v);
      const a = clamp((this.selectedCar.accel || 520) / 800, 0.05, 0.18);
      this.car.body.velocity.x = Phaser.Math.Linear(this.car.body.velocity.x, v.x, a);
      this.car.body.velocity.y = Phaser.Math.Linear(this.car.body.velocity.y, v.y, a);
    }

    if (this.manualCamera) this.clampCameraToWorld();
  }

  makeTileTexture(key, w, h, c1, c2){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(c1, 1).fillRect(0, 0, w, h);
    g.fillStyle(c2, 0.22).fillRect(0, 0, w, h/2);
    g.lineStyle(1, 0xffffff, 0.06).strokeRect(1, 1, w-2, h-2);
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeFinishFlagTexture(key, w, h){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.lineStyle(4, 0x8b5a2b, 1).lineBetween(w*0.25, h*0.92, w*0.25, h*0.12);
    g.fillStyle(0xffd84d, 1);
    g.fillRoundedRect(w*0.28, h*0.14, w*0.46, h*0.30, 6);
    g.fillStyle(0xff6b6b, 1).fillCircle(w*0.38, h*0.29, 4).fillCircle(w*0.58, h*0.25, 4);
    g.fillStyle(0xffffff, 0.95).fillCircle(w*0.50, h*0.34, 4);
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

  makeCarTexture(key, w, h, bodyColor, stripeColor, moto=false){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    if (moto){
      g.fillStyle(0x111111, 1).fillCircle(w * 0.3, h * 0.77, 8).fillCircle(w * 0.7, h * 0.77, 8);
      g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.36, h * 0.18, w * 0.28, h * 0.46, 10);
      g.fillStyle(stripeColor, 0.9).fillRect(w * 0.43, h * 0.24, w * 0.14, h * 0.24);
      g.lineStyle(4, 0x333333, 1).lineBetween(w * 0.28, h * 0.3, w * 0.72, h * 0.3).lineBetween(w * 0.35, h * 0.62, w * 0.67, h * 0.62);
    } else {
      g.fillStyle(0x111111, 1).fillCircle(w * 0.23, h * 0.2, 8).fillCircle(w * 0.77, h * 0.2, 8).fillCircle(w * 0.23, h * 0.8, 8).fillCircle(w * 0.77, h * 0.8, 8);
      g.fillStyle(bodyColor, 1).fillRoundedRect(w * 0.18, h * 0.08, w * 0.64, h * 0.84, 16);
      g.fillStyle(0x7fc8ff, 0.9).fillRoundedRect(w * 0.28, h * 0.16, w * 0.44, h * 0.22, 8);
      g.fillStyle(stripeColor, 0.95).fillRect(w * 0.43, h * 0.12, w * 0.14, h * 0.7);
      g.fillStyle(0xff3333, 0.9).fillRect(w * 0.25, h * 0.76, 8, 8).fillRect(w * 0.67, h * 0.76, 8, 8);
    }
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeAtlasWorldTexture(key, w, h){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0x2e7ed3, 1).fillRoundedRect(0, 0, w, h, 18);
    const poly = (pts, fill)=>{
      g.fillStyle(fill, 1);
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
      g.closePath();
      g.fillPath();
      g.lineStyle(1, 0xeaffef, 0.35).strokePath();
    };
    poly([[22,46],[35,30],[46,26],[54,36],[51,52],[44,64],[38,82],[31,102],[24,112],[18,98],[18,78]], 0x67ba61);
    poly([[56,100],[66,90],[76,96],[78,114],[72,130],[62,138],[56,124]], 0x67ba61);
    poly([[128,38],[138,34],[147,40],[148,50],[140,56],[132,52]], 0x67ba61);
    poly([[134,58],[148,58],[156,72],[154,90],[148,110],[138,126],[128,118],[126,96],[128,76]], 0x67ba61);
    poly([[154,40],[176,30],[212,34],[244,48],[260,64],[254,82],[236,92],[206,88],[194,100],[174,96],[160,78],[152,62]], 0x67ba61);
    poly([[232,112],[246,108],[258,116],[260,130],[248,136],[236,128]], 0x67ba61);
    g.lineStyle(3, 0x8fff96, 1);
    g.beginPath();
    g.moveTo(124,34); g.lineTo(141,30); g.lineTo(153,39); g.lineTo(151,55); g.lineTo(138,59); g.lineTo(126,52); g.closePath();
    g.strokePath();
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makeEuropeTexture(key, w, h){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0x2e7ed3, 1).fillRoundedRect(0, 0, w, h, 18);

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
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'wrap',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#111827',
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [MainScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});

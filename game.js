const VIEW_W = 390;
const VIEW_H = 780;
const CELL = 44;

const CARS = [
  { id:"taxi",    name:"Taxi",    color:0xffd800, maxSpeed:230, accel:520 },
  { id:"motorka", name:"Motorka", color:0xFF69B4, maxSpeed:280, accel:560, widthMul:0.55, heightMul:0.85 },
  { id:"auto",    name:"Auto",    color:0xffffff, maxSpeed:240, accel:520, widthMul:1.0, heightMul:1.0 }
];

const RULES = { finishReward: 100, crashPenalty: 10 };

const MAPS = {
  si: { id:"si", name:"Slovinsko", unlocked:true, grid: [
    "........................",
    "........................",
    "...........######.......",
    "........############....",
    "......################..",
    ".....##################.",
    "....###################.",
    "...####################.",
    "...###################..",
    "..###################...",
    "..##################....",
    "..#################.....",
    "..################......",
    "...###############......",
    "....##########F###......",
    ".....############.......",
    "......###########.......",
    ".......##########.......",
    "........#######.........",
    "..........S####.........",
    "..............###.......",
    "...............###......",
    "........................",
    "........................"
  ]},
  it: { id:"it", name:"Taliansko", unlocked:false },
  at: { id:"at", name:"Rakúsko", unlocked:false },
  hr: { id:"hr", name:"Chorvátsko", unlocked:false },
  hu: { id:"hu", name:"Maďarsko", unlocked:false }
};

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function dist(ax, ay, bx, by){ return Math.hypot(ax - bx, ay - by); }

class MainScene extends Phaser.Scene {
  constructor(){ super("main"); }

  init(){
    this.state = "menu";
    this.money = 0;
    this.best = 0;

    this.carIndex = 0;
    this.selectedCar = CARS[this.carIndex];
    this.selectedMap = MAPS.si;

    this.gridVisible = false;
    this.steer = 0;
    this.wheel = { active:false, id:null, cx:110, cy:VIEW_H-95, r:70 };

    this.cameraDetached = false;
    this.cameraZoom = 1;
    this.dragPointerId = null;
    this.dragLast = null;
    this.pinch = { active:false, startDist:0, startZoom:1 };
    this.menuMapMode = "world";
  }

  create(){
    this.makeRectTexture("tex_car", 34, 54, 0xffffff);
    this.makeRectTexture("tex_wall", CELL, CELL, 0x0b2a4a);
    this.makeRectTexture("tex_road", CELL, CELL, 0x202020);

    this.uiTitle = this.add.text(VIEW_W/2, 16, "Šoférujeme 4", { fontSize:"18px", color:"#fff" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    this.uiMoney = this.add.text(12, 46, "Peníze: 0", { fontSize:"16px", color:"#fff" })
      .setScrollFactor(0).setDepth(1000);
    this.uiInfo  = this.add.text(12, 70, "", { fontSize:"14px", color:"#ccc" })
      .setScrollFactor(0).setDepth(1000);

    this.uiLightBox = this.add.rectangle(VIEW_W-44, 56, 56, 56, 0x0e0e0e).setScrollFactor(0).setDepth(1000);
    this.lightDot = this.add.circle(VIEW_W-44, 56, 16, 0x2bdc4a).setScrollFactor(0).setDepth(1001);

    this.cursors = this.input.keyboard.createCursorKeys();

    this.touch = { gas:false };
    this.gasBtn = this.add.rectangle(VIEW_W-90, VIEW_H-80, 110, 110, 0x000000, 0.35)
      .setInteractive().setScrollFactor(0).setDepth(1000);
    this.gasTxt = this.add.text(VIEW_W-90, VIEW_H-80, "⛽", { fontSize:"34px", color:"#fff" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    this.gasBtn.on("pointerdown", ()=>{
      this.touch.gas = true;
      this.attachCameraToCar();
    });
    this.gasBtn.on("pointerup",   ()=> this.touch.gas = false);
    this.gasBtn.on("pointerout",  ()=> this.touch.gas = false);

    this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x000000, 0.30)
      .setScrollFactor(0).setDepth(1000);
    this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r-10, 0xffffff, 0.06)
      .setScrollFactor(0).setDepth(1001);
    this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r-16), 12, 0xffffff, 0.18)
      .setScrollFactor(0).setDepth(1002);

    this.input.addPointer(3);

    this.input.on("pointerdown", (p)=>{
      if (this.state !== "playing") return;
      if (this.isPointerOnWheel(p)){
        this.wheel.active = true;
        this.wheel.id = p.id;
        this.updateWheelFromPointer(p);
        return;
      }
      if (this.isPointerOnGas(p)) return;

      const activeTouches = this.getNonControlPointers();
      if (activeTouches.length >= 2){
        this.startPinch();
      } else {
        this.detachCameraForFreeLook();
        this.dragPointerId = p.id;
        this.dragLast = { x:p.x, y:p.y };
      }
    });

    this.input.on("pointermove", (p)=>{
      if (this.state !== "playing") return;

      if (this.wheel.active && p.id === this.wheel.id){
        this.updateWheelFromPointer(p);
        return;
      }

      const freeTouches = this.getNonControlPointers();
      if (freeTouches.length >= 2){
        this.handlePinchZoom(freeTouches[0], freeTouches[1]);
        return;
      }

      if (this.dragPointerId === p.id && this.dragLast){
        this.detachCameraForFreeLook();
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - this.dragLast.x) / cam.zoom;
        cam.scrollY -= (p.y - this.dragLast.y) / cam.zoom;
        this.clampCameraToBounds();
        this.dragLast = { x:p.x, y:p.y };
      }
    });

    const releaseWheel = ()=>{
      this.wheel.active = false;
      this.wheel.id = null;
      this.steer = 0;
      this.wheelKnob.setPosition(this.wheel.cx, this.wheel.cy - (this.wheel.r-16));
    };

    this.input.on("pointerup", (p)=>{
      if (this.wheel.active && p.id === this.wheel.id) releaseWheel();
      if (this.dragPointerId === p.id){
        this.dragPointerId = null;
        this.dragLast = null;
      }
      if (this.getNonControlPointers().length < 2){
        this.pinch.active = false;
      }
    });
    this.input.on("pointerupoutside", ()=>{
      if (this.wheel.active) releaseWheel();
      this.dragPointerId = null;
      this.dragLast = null;
      this.pinch.active = false;
    });

    this.input.keyboard.on("keydown-G", ()=>{
      if (this.state !== "playing") return;
      this.gridVisible = !this.gridVisible;
      if (this.gridLayer) this.gridLayer.setVisible(this.gridVisible);
    });

    this.buildMenu();
    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);

    this.refreshMenuTexts();
    this.setState("menu");
  }

  isPointerOnWheel(p){
    const dx = p.x - this.wheel.cx;
    const dy = p.y - this.wheel.cy;
    return Math.hypot(dx, dy) <= this.wheel.r;
  }

  isPointerOnGas(p){
    return Phaser.Geom.Rectangle.Contains(this.gasBtn.getBounds(), p.x, p.y);
  }

  getNonControlPointers(){
    return this.input.manager.pointers.filter(p => p.isDown && !this.isPointerOnWheel(p) && !this.isPointerOnGas(p));
  }

  startPinch(){
    const pts = this.getNonControlPointers();
    if (pts.length < 2) return;
    this.detachCameraForFreeLook();
    this.pinch.active = true;
    this.pinch.startDist = dist(pts[0].x, pts[0].y, pts[1].x, pts[1].y);
    this.pinch.startZoom = this.cameras.main.zoom;
    this.dragPointerId = null;
    this.dragLast = null;
  }

  handlePinchZoom(a, b){
    if (!this.pinch.active){
      this.startPinch();
      return;
    }
    const d = dist(a.x, a.y, b.x, b.y);
    if (!this.pinch.startDist) return;
    const z = clamp(this.pinch.startZoom * (d / this.pinch.startDist), 0.65, 2.1);
    this.cameraZoom = z;
    this.cameras.main.setZoom(z);
    this.clampCameraToBounds();
  }

  detachCameraForFreeLook(){
    if (this.cameraDetached || !this.car) return;
    this.cameraDetached = true;
    this.cameras.main.stopFollow();
  }

  attachCameraToCar(){
    if (!this.car) return;
    this.cameraDetached = false;
    this.cameraZoom = 1;
    this.cameras.main.setZoom(1);
    this.cameras.main.startFollow(this.car, true, 0.16, 0.16);
    this.cameras.main.setDeadzone(40, 60);
  }

  clampCameraToBounds(){
    const cam = this.cameras.main;
    const maxX = Math.max(0, this.worldW - cam.width / cam.zoom);
    const maxY = Math.max(0, this.worldH - cam.height / cam.zoom);
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

  buildMenu(){
    const w = VIEW_W, h = VIEW_H;
    this.menuBg = this.add.rectangle(w/2, h/2, w*0.94, h*0.80, 0x000000, 0.76).setScrollFactor(0).setDepth(2000);
    this.menuTitle = this.add.text(w/2, 48, "Šoférujeme 4", { fontSize:"24px", color:"#fff", fontStyle:"bold" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.menuCarLabel = this.add.text(w/2, 100, "VYBER AUTO", { fontSize:"14px", color:"#bdbdbd" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    this.menuCarPreview = this.add.rectangle(w/2, 165, 52, 84, this.selectedCar.color, 1)
      .setStrokeStyle(4, 0xffffff, 0.25).setScrollFactor(0).setDepth(2001);
    this.menuCarText = this.add.text(w/2, 240, "", { fontSize:"18px", color:"#fff", align:"center" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    this.btnCarPrev = this.add.rectangle(w/2-116, 165, 76, 48, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.btnCarNext = this.add.rectangle(w/2+116, 165, 76, 48, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.btnCarPrevTxt = this.add.text(w/2-116, 165, "◀", { fontSize:"24px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);
    this.btnCarNextTxt = this.add.text(w/2+116, 165, "▶", { fontSize:"24px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    this.menuMapLabel = this.add.text(w/2, 300, "VYBER MAPU", { fontSize:"14px", color:"#bdbdbd" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    this.menuMapSubLabel = this.add.text(w/2, 326, "Klikni na Európu → potom na Slovinsko", { fontSize:"13px", color:"#d7d7d7" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.mapPanel = this.add.container(0,0).setScrollFactor(0).setDepth(2001);
    this.mapPanelBg = this.add.rectangle(w/2, 515, 320, 300, 0x0a3d91, 1).setStrokeStyle(3, 0xffffff, 0.15);
    this.mapPanel.add(this.mapPanelBg);

    this.worldShapes = [];
    this.europeShapes = [];

    this.buildWorldAtlas();
    this.buildEuropeAtlas();

    this.menuMapText = this.add.text(w/2, 665, "", { fontSize:"18px", color:"#fff", align:"center" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.btnBackToWorld = this.add.rectangle(76, 352, 86, 34, 0x1f1f1f, 1).setInteractive().setScrollFactor(0).setDepth(2002);
    this.btnBackToWorldTxt = this.add.text(76, 352, "← späť", { fontSize:"15px", color:"#fff" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2003);
    this.btnBackToWorld.on("pointerdown", ()=>{
      this.menuMapMode = "world";
      this.updateMapMenuVisibility();
    });

    this.btnStart = this.add.rectangle(w/2, 728, 240, 66, 0x2bdc4a, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.btnStartTxt = this.add.text(w/2, 728, "START", { fontSize:"22px", color:"#111" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    this.btnCarPrev.on("pointerdown", ()=>{
      this.carIndex = (this.carIndex - 1 + CARS.length) % CARS.length;
      this.selectedCar = CARS[this.carIndex];
      this.refreshMenuTexts();
    });
    this.btnCarNext.on("pointerdown", ()=>{
      this.carIndex = (this.carIndex + 1) % CARS.length;
      this.selectedCar = CARS[this.carIndex];
      this.refreshMenuTexts();
    });
    this.btnStart.on("pointerdown", ()=> this.startGame());

    this.updateMapMenuVisibility();
  }

  addAtlasTile(x, y, w, h, color, label, targetList, onClick, radius=18){
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.lineStyle(2, 0xffffff, 0.16);
    g.fillRoundedRect(x - w/2, y - h/2, w, h, radius);
    g.strokeRoundedRect(x - w/2, y - h/2, w, h, radius);
    const zone = this.add.zone(x, y, w, h).setOrigin(0.5).setInteractive();
    const txt = this.add.text(x, y, label, { fontSize:"14px", color:"#fff", fontStyle:"bold", align:"center", wordWrap:{ width:w-12 } }).setOrigin(0.5);
    if (onClick) zone.on("pointerdown", onClick);
    this.mapPanel.add([g, zone, txt]);
    targetList.push(g, zone, txt);
    return zone;
  }

  buildWorldAtlas(){
    this.addAtlasTile(92, 452, 82, 54, 0x3f8f45, "S. Amerika", this.worldShapes, null, 20);
    this.addAtlasTile(116, 555, 60, 94, 0x3f8f45, "J. Amerika", this.worldShapes, null, 20);
    this.addAtlasTile(196, 450, 76, 50, 0x4ea85b, "Európa", this.worldShapes, ()=>{
      this.menuMapMode = "europe";
      this.updateMapMenuVisibility();
    }, 20);
    this.addAtlasTile(228, 532, 96, 124, 0x3f8f45, "Afrika", this.worldShapes, null, 22);
    this.addAtlasTile(284, 450, 124, 96, 0x447f3d, "Ázia", this.worldShapes, null, 22);
    this.addAtlasTile(308, 582, 72, 40, 0x5b9e45, "Austrália", this.worldShapes, null, 18);
  }

  buildEuropeAtlas(){
    const seaText = this.add.text(195, 392, "Európa", { fontSize:"20px", color:"#dcefff", fontStyle:"bold" }).setOrigin(0.5);
    this.mapPanel.add(seaText);
    this.europeShapes.push(seaText);

    this.addAtlasTile(160, 468, 52, 34, 0x5e5e5e, "🔒", this.europeShapes, null, 12);
    this.addAtlasTile(205, 454, 46, 30, 0x5e5e5e, "🔒", this.europeShapes, null, 12);
    this.addAtlasTile(224, 489, 34, 20, 0x4ea85b, "SI", this.europeShapes, ()=>{
      this.selectedMap = MAPS.si;
      this.refreshMenuTexts();
    }, 10);
    this.addAtlasTile(248, 504, 40, 26, 0x5e5e5e, "🔒", this.europeShapes, null, 12);
    this.addAtlasTile(252, 470, 46, 28, 0x5e5e5e, "🔒", this.europeShapes, null, 12);
    this.addAtlasTile(188, 510, 48, 48, 0x5e5e5e, "🔒", this.europeShapes, null, 12);
    this.addAtlasTile(284, 500, 48, 36, 0x5e5e5e, "🔒", this.europeShapes, null, 12);

    const slText = this.add.text(226, 516, "Slovinsko", { fontSize:"12px", color:"#fff", fontStyle:"bold" }).setOrigin(0.5);
    this.mapPanel.add(slText);
    this.europeShapes.push(slText);
  }

  updateMapMenuVisibility(){
    const world = this.menuMapMode === "world";
    this.worldShapes.forEach(o => o.setVisible(world));
    this.europeShapes.forEach(o => o.setVisible(!world));
    this.btnBackToWorld.setVisible(!world);
    this.btnBackToWorldTxt.setVisible(!world);
    this.menuMapSubLabel.setText(world ? "Klikni na Európu → potom na Slovinsko" : "Slovinsko je odomknuté, ostatné krajiny sú zatiaľ zamknuté");
  }

  refreshMenuTexts(){
    const c = this.selectedCar;
    this.menuCarPreview.fillColor = c.color;
    this.menuCarText.setText(`${c.name}\nmax ${c.maxSpeed}`);
    this.menuMapText.setText(`Mapa: ${this.selectedMap.name}`);
  }

  setState(s){
    this.state = s;
    const showMenu = (s === "menu");
    const playing = (s === "playing");

    [
      this.menuBg, this.menuTitle,
      this.menuCarLabel, this.menuCarPreview, this.menuCarText,
      this.btnCarPrev, this.btnCarNext,
      this.btnCarPrevTxt, this.btnCarNextTxt,
      this.menuMapLabel, this.menuMapSubLabel, this.menuMapText,
      this.mapPanel, this.btnBackToWorld, this.btnBackToWorldTxt,
      this.btnStart, this.btnStartTxt
    ].forEach(o => o.setVisible(showMenu));
    this.updateMapMenuVisibility();

    this.wheelBase.setVisible(playing);
    this.wheelRing.setVisible(playing);
    this.wheelKnob.setVisible(playing);
    this.gasBtn.setVisible(playing);
    this.gasTxt.setVisible(playing);

    if (showMenu){
      this.uiInfo.setText("Vyber auto hore a mapu dole.");
      this.lightDot.setFillStyle(0x2bdc4a);
    } else {
      this.uiInfo.setText(`Mapa: ${this.selectedMap.name} • Auto: ${this.selectedCar.name}`);
      this.lightDot.setFillStyle(0xffd84a);
    }
  }

  clearWorld(){
    if (this.landLayer) this.landLayer.destroy(true);
    if (this.wallGroup) this.wallGroup.clear(true, true);
    if (this.obstacles) this.obstacles.clear(true, true);
    if (this.finishZone) this.finishZone.destroy();
    if (this.car) this.car.destroy();
    if (this.gridLayer) this.gridLayer.destroy(true);

    this.landLayer = null;
    this.wallGroup = null;
    this.obstacles = null;
    this.finishZone = null;
    this.car = null;
    this.gridLayer = null;
  }

  normalizeGrid(grid){
    const rows = grid.length;
    const cols = Math.max(...grid.map(s=>s.length));
    const out = [];
    for (let y=0; y<rows; y++) out.push(grid[y].padEnd(cols, "."));
    return out;
  }

  findCell(grid, ch){
    for (let y=0; y<grid.length; y++){
      const line = grid[y];
      for (let x=0; x<line.length; x++) if (line[x] === ch) return {x,y};
    }
    return null;
  }

  isDriveable(grid, x, y){
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return false;
    const c = grid[y][x];
    return c === "#" || c === "S" || c === "F";
  }

  findSafeLand(grid){
    for (let y=1; y<grid.length-1; y++){
      const line = grid[y];
      for (let x=1; x<line.length-1; x++){
        if (!this.isDriveable(grid, x, y)) continue;
        if (this.isDriveable(grid, x-1, y) && this.isDriveable(grid, x+1, y) && this.isDriveable(grid, x, y-1) && this.isDriveable(grid, x, y+1)){
          return {x,y};
        }
      }
    }
    for (let y=0; y<grid.length; y++){
      for (let x=0; x<grid[0].length; x++){
        if (this.isDriveable(grid, x, y)) return {x,y};
      }
    }
    return {x:1,y:1};
  }

  ensureFinishInside(grid, finishCell, startCell){
    if (finishCell && this.isDriveable(grid, finishCell.x, finishCell.y)) return finishCell;
    const candidates = [];
    for (let y=1; y<grid.length-1; y++){
      for (let x=1; x<grid[0].length-1; x++){
        if (!this.isDriveable(grid, x, y)) continue;
        if (!this.isDriveable(grid, x-1, y) || !this.isDriveable(grid, x+1, y) || !this.isDriveable(grid, x, y-1) || !this.isDriveable(grid, x, y+1)) continue;
        const d = Math.abs(x - startCell.x) + Math.abs(y - startCell.y);
        if (d >= 6) candidates.push({x,y,d});
      }
    }
    candidates.sort((a,b)=> b.d - a.d);
    return candidates[0] || this.findSafeLand(grid);
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

    for (let y=0; y<rows; y++){
      const line = grid[y];
      for (let x=0; x<cols; x++){
        const ch = line[x];
        const cx = x * CELL + CELL/2;
        const cy = y * CELL + CELL/2;

        if (this.isDriveable(grid, x, y)){
          this.landLayer.add(this.add.image(cx, cy, "tex_road"));
        } else {
          this.landLayer.add(this.add.image(cx, cy, "tex_wall"));
          const wall = this.add.rectangle(cx, cy, CELL, CELL, 0x000000, 0);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        }
      }
    }

    this.gridLayer = this.add.graphics();
    this.gridLayer.setVisible(this.gridVisible);
    this.gridLayer.lineStyle(1, 0xffffff, 0.10);
    for (let y=0; y<=rows; y++) this.gridLayer.lineBetween(0, y*CELL, this.worldW, y*CELL);
    for (let x=0; x<=cols; x++) this.gridLayer.lineBetween(x*CELL, 0, x*CELL, this.worldH);
    this.gridLayer.setDepth(10);

    const startCell = this.findCell(grid, "S") || this.findSafeLand(grid);
    const finishCell = this.ensureFinishInside(grid, this.findCell(grid, "F"), startCell);

    const sx = startCell.x*CELL + CELL/2;
    const sy = startCell.y*CELL + CELL/2;
    const fx = finishCell.x*CELL + CELL/2;
    const fy = finishCell.y*CELL + CELL/2;

    this.landLayer.add(this.add.rectangle(sx, sy, CELL*0.92, 10, 0xffffff, 1));
    this.landLayer.add(this.add.rectangle(fx, fy, CELL*0.92, 8, 0x4ea3ff, 1));

    this.finishZone = this.add.zone(fx, fy, CELL*0.92, CELL*0.92);
    this.physics.add.existing(this.finishZone, true);

    const landCells = [];
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++) if (grid[y][x] === "#") landCells.push({x,y});
    }
    Phaser.Utils.Array.Shuffle(landCells);
    const obsCount = Math.min(10, Math.floor(landCells.length * 0.08));
    for (let i=0; i<obsCount; i++){
      const c = landCells[i];
      if (!c) continue;
      if (c.x === startCell.x && c.y === startCell.y) continue;
      if (c.x === finishCell.x && c.y === finishCell.y) continue;
      const ox = c.x*CELL + CELL/2;
      const oy = c.y*CELL + CELL/2;
      const r = this.add.rectangle(ox, oy, 70, 30, 0xffb020, 1);
      r.setRotation((i%2===0)?0:Math.PI/2);
      this.physics.add.existing(r, true);
      this.obstacles.add(r);
    }

    const baseW = 34, baseH = 54;
    const wMul = this.selectedCar.widthMul || 1;
    const hMul = this.selectedCar.heightMul || 1;

    this.car = this.physics.add.image(sx, sy, "tex_car");
    this.car.setTint(this.selectedCar.color);
    this.car.setDisplaySize(baseW*wMul, baseH*hMul);
    this.car.body.setSize(baseW*wMul, baseH*hMul, true);
    this.car.setDrag(320, 320);
    this.car.setCollideWorldBounds(true);
    this.car.body.setMaxVelocity(this.selectedCar.maxSpeed, this.selectedCar.maxSpeed);
    this.car.body.setAngularVelocity(0);

    this.physics.add.collider(this.car, this.wallGroup, ()=>this.onCrash(), null, this);
    this.physics.add.collider(this.car, this.obstacles, ()=>this.onCrash(), null, this);
    this.physics.add.overlap(this.car, this.finishZone, ()=>this.onFinish(), null, this);

    this.cameras.main.setBounds(0,0,this.worldW,this.worldH);
    this.attachCameraToCar();
  }

  startGame(){
    this.money = 0;
    this.steer = 0;
    this.wheel.active = false;
    this.wheel.id = null;
    this.dragPointerId = null;
    this.dragLast = null;
    this.pinch.active = false;
    this.wheelKnob.setPosition(this.wheel.cx, this.wheel.cy - (this.wheel.r-16));

    this.buildWorld(this.selectedMap);
    this.setState("playing");
  }

  playWinSound(){
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      const ctx = this.audioCtx;
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i)=>{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i*0.11);
        gain.gain.exponentialRampToValueAtTime(0.12, now + i*0.11 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i*0.11 + 0.10);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i*0.11);
        osc.stop(now + i*0.11 + 0.11);
      });
    } catch(e) {}
  }

  onCrash(){
    if (this.state !== "playing") return;
    this.money = Math.max(0, this.money - RULES.crashPenalty);
    this.uiInfo.setText(`💥 Náraz (-${RULES.crashPenalty})`);
  }

  onFinish(){
    if (this.state !== "playing") return;
    this.money += RULES.finishReward;
    this.best = Math.max(this.best, this.money);
    this.playWinSound();
    this.uiInfo.setText(`🏁 CÍL! Peníze: ${this.money} (best: ${this.best})`);
    this.setState("menu");
    this.cameras.main.stopFollow();
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;
    this.cameras.main.setZoom(1);
    this.clearWorld();
  }

  update(){
    this.uiMoney.setText(`Peníze: ${this.money}`);
    if (this.state !== "playing" || !this.car) return;

    const gas = this.touch.gas || this.cursors.up.isDown;

    let kbSteer = 0;
    if (this.cursors.left.isDown) kbSteer -= 1;
    if (this.cursors.right.isDown) kbSteer += 1;

    let steer = clamp(this.steer + kbSteer, -1, 1);

    if (!this.wheel.active && kbSteer === 0){
      this.steer = Phaser.Math.Linear(this.steer, 0, 0.12);
      steer = this.steer;
    }

    if (Math.abs(steer) > 0.01 || gas){
      this.attachCameraToCar();
    }

    const speed = this.car.body.speed || 0;
    const speedN = clamp(speed / (this.selectedCar.maxSpeed || 240), 0, 1);
    const turnSpeed = 260;
    const angVel = steer * turnSpeed * speedN;
    this.car.body.setAngularVelocity(angVel);

    if (gas){
      const angleDeg = (this.car.rotation * 180/Math.PI) - 90;
      const v = new Phaser.Math.Vector2();
      this.physics.velocityFromAngle(angleDeg, this.selectedCar.maxSpeed, v);

      const a = clamp((this.selectedCar.accel || 520) / 800, 0.05, 0.18);
      this.car.body.velocity.x = Phaser.Math.Linear(this.car.body.velocity.x, v.x, a);
      this.car.body.velocity.y = Phaser.Math.Linear(this.car.body.velocity.y, v.y, a);
    }
  }

  makeRectTexture(key, w, h, color){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(0, 0, w, h);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "wrap",
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: "#111",
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [MainScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});

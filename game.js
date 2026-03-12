const VIEW_W = 390;
const VIEW_H = 780;
const CELL = 44;

const TITLE = "Šoférujeme verzia 4";

const CARS = [
  { id:"taxi",    name:"Taxi",    color:0xffd800, maxSpeed:230, accel:560 },
  { id:"motorka", name:"Motorka", color:0xFF69B4, maxSpeed:280, accel:620, widthMul:0.55, heightMul:0.85 },
  { id:"auto",    name:"Auto",    color:0xffffff, maxSpeed:240, accel:580, widthMul:1.0, heightMul:1.0 }
];

const RULES = { finishReward: 100, crashPenalty: 10 };

const MAPS = {
  si: { id:"si", name:"Slovinsko", continent:"eu", locked:false, grid: [
    "........................",
    "........................",
    "..........######........",
    "........##########......",
    "......#############.....",
    ".....###############....",
    "....################....",
    "...##################...",
    "...###################..",
    "..####################..",
    "..####################..",
    "..###################...",
    "...#################....",
    "....###############.....",
    ".....##############.....",
    "......#############.....",
    ".......###########......",
    "........#########.......",
    ".........#######........",
    "..........S####.........",
    "...........#####........",
    "............###F........",
    "........................",
    "........................"
  ]},
  sk: { id:"sk", name:"Slovensko", continent:"eu", locked:true, grid: [] },
  cz: { id:"cz", name:"Česko", continent:"eu", locked:true, grid: [] },
  hr: { id:"hr", name:"Chorvátsko", continent:"eu", locked:true, grid: [] }
};

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

class MainScene extends Phaser.Scene {
  constructor(){ super("main"); }

  init(){
    this.state = "menu";
    this.menuStep = "atlas";
    this.money = 0;
    this.best = 0;

    this.carIndex = 0;
    this.selectedCar = CARS[this.carIndex];
    this.selectedContinent = "eu";
    this.selectedMap = MAPS.si;

    this.gridVisible = false;
    this.finishTriggered = false;

    this.steer = 0;
    this.wheel = { active:false, id:null, cx:110, cy:VIEW_H-95, r:70, angle:-Math.PI/2 };
    this.touch = { gas:false };

    this.cameraDrag = { active:false, id:null, lastX:0, lastY:0 };
  }

  create(){
    this.makeCarTexture("tex_car", 34, 54);
    this.makeRectTexture("tex_ocean", CELL, CELL, 0x2778c7);
    this.makeRectTexture("tex_land", CELL, CELL, 0x59a14f);
    this.makeRectTexture("tex_locked", CELL, CELL, 0x1b3f66);

    this.createUi();
    this.createMenu();
    this.createControls();
    this.createInputHandlers();

    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);
    this.setMenuStep("atlas");
    this.setState("menu");
  }

  createUi(){
    this.uiTitle = this.add.text(VIEW_W/2, 18, TITLE, { fontSize:"20px", color:"#ffffff", fontStyle:"bold" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    this.uiMoney = this.add.text(12, 50, "Peníze: 0", { fontSize:"16px", color:"#ffffff" })
      .setScrollFactor(0).setDepth(1000);
    this.uiInfo = this.add.text(12, 74, "", { fontSize:"14px", color:"#d9edf7" })
      .setScrollFactor(0).setDepth(1000);

    this.uiLightBox = this.add.rectangle(VIEW_W-44, 58, 56, 56, 0x0e0e0e).setScrollFactor(0).setDepth(1000);
    this.lightDot = this.add.circle(VIEW_W-44, 58, 16, 0x2bdc4a).setScrollFactor(0).setDepth(1001);
  }

  createControls(){
    this.cursors = this.input.keyboard.createCursorKeys();

    this.gasBtn = this.add.circle(VIEW_W-88, VIEW_H-82, 54, 0x000000, 0.35)
      .setInteractive().setScrollFactor(0).setDepth(1000);
    this.gasTxt = this.add.text(VIEW_W-88, VIEW_H-82, "⛽", { fontSize:"34px", color:"#fff" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    this.gasBtn.on("pointerdown", ()=> this.touch.gas = true);
    this.gasBtn.on("pointerup", ()=> this.touch.gas = false);
    this.gasBtn.on("pointerout", ()=> this.touch.gas = false);

    this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x000000, 0.30)
      .setScrollFactor(0).setDepth(1000);
    this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r-10, 0xffffff, 0.08)
      .setScrollFactor(0).setDepth(1001);
    this.wheelSpokeA = this.add.rectangle(this.wheel.cx, this.wheel.cy-18, 8, 64, 0xffffff, 0.22)
      .setScrollFactor(0).setDepth(1002).setOrigin(0.5, 0.75);
    this.wheelSpokeB = this.add.rectangle(this.wheel.cx-20, this.wheel.cy+18, 8, 50, 0xffffff, 0.22)
      .setScrollFactor(0).setDepth(1002).setOrigin(0.5, 0.2).setRotation(-0.9);
    this.wheelSpokeC = this.add.rectangle(this.wheel.cx+20, this.wheel.cy+18, 8, 50, 0xffffff, 0.22)
      .setScrollFactor(0).setDepth(1002).setOrigin(0.5, 0.2).setRotation(0.9);
    this.wheelHub = this.add.circle(this.wheel.cx, this.wheel.cy, 16, 0xffffff, 0.18)
      .setScrollFactor(0).setDepth(1003);
    this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r-16), 10, 0xffffff, 0.28)
      .setScrollFactor(0).setDepth(1004);

    this.rotateWheelVisual(-Math.PI/2);
  }

  createMenu(){
    const w = VIEW_W;
    const h = VIEW_H;

    this.menuContainer = this.add.container(0, 0).setDepth(2000).setScrollFactor(0);
    this.menuBg = this.add.rectangle(w/2, h/2, w*0.94, h*0.80, 0x041a2f, 0.92);
    this.menuTitle = this.add.text(w/2, 120, "Vyber mapu", { fontSize:"24px", color:"#ffffff", fontStyle:"bold" }).setOrigin(0.5);
    this.menuSubtitle = this.add.text(w/2, 154, "Atlas sveta", { fontSize:"15px", color:"#b7d9f7" }).setOrigin(0.5);
    this.menuContainer.add([this.menuBg, this.menuTitle, this.menuSubtitle]);

    this.atlasContainer = this.add.container(0, 0);
    this.menuContainer.add(this.atlasContainer);

    const atlasX = w/2;
    const atlasY = 372;
    this.atlasOcean = this.add.rectangle(atlasX, atlasY, 300, 250, 0x2f8ed8, 1).setStrokeStyle(3, 0x9fd6ff, 0.35);
    this.atlasContainer.add(this.atlasOcean);

    this.continentNodes = {};
    this.makeContinent("na", atlasX-86, atlasY-28, 78, 54, 0x477b35, "Sev. Amerika", true);
    this.makeContinent("sa", atlasX-66, atlasY+56, 46, 70, 0x477b35, "Juž. Amerika", true);
    this.makeContinent("eu", atlasX+34, atlasY-40, 54, 34, 0x6fd45f, "Európa", false);
    this.makeContinent("af", atlasX+48, atlasY+36, 56, 78, 0x477b35, "Afrika", true);
    this.makeContinent("asia", atlasX+108, atlasY-16, 96, 68, 0x477b35, "Ázia", true);
    this.makeContinent("au", atlasX+122, atlasY+88, 50, 34, 0x477b35, "Austrália", true);

    this.atlasHint = this.add.text(w/2, 520, "Klikni na svetadiel", { fontSize:"15px", color:"#e8f6ff" }).setOrigin(0.5);
    this.atlasContainer.add(this.atlasHint);

    this.countryContainer = this.add.container(0, 0);
    this.menuContainer.add(this.countryContainer);

    this.countryPanel = this.add.rectangle(w/2, 380, 300, 280, 0x0a2744, 1).setStrokeStyle(2, 0x79b9ff, 0.4);
    this.countryTitle = this.add.text(w/2, 255, "Európa", { fontSize:"22px", color:"#ffffff", fontStyle:"bold" }).setOrigin(0.5);
    this.countrySubtitle = this.add.text(w/2, 285, "Odomknuté: Slovinsko", { fontSize:"14px", color:"#b8d8f8" }).setOrigin(0.5);
    this.countryContainer.add([this.countryPanel, this.countryTitle, this.countrySubtitle]);

    this.countryCards = [];
    this.createCountryCard(1, 320, MAPS.si.name, false, ()=>{ this.selectedMap = MAPS.si; this.refreshCountryCards(); });
    this.createCountryCard(2, 390, MAPS.sk.name, true);
    this.createCountryCard(3, 460, MAPS.cz.name, true);
    this.createCountryCard(4, 530, MAPS.hr.name, true);

    this.btnBack = this.add.rectangle(86, 620, 110, 46, 0x173b5f, 1).setInteractive();
    this.btnBackTxt = this.add.text(86, 620, "Späť", { fontSize:"18px", color:"#ffffff" }).setOrigin(0.5);
    this.btnBack.on("pointerdown", ()=> this.setMenuStep("atlas"));

    this.btnCarPrev = this.add.rectangle(100, 680, 56, 48, 0x1b4f79, 1).setInteractive();
    this.btnCarNext = this.add.rectangle(290, 680, 56, 48, 0x1b4f79, 1).setInteractive();
    this.btnCarPrevTxt = this.add.text(100, 680, "◀", { fontSize:"24px", color:"#ffffff" }).setOrigin(0.5);
    this.btnCarNextTxt = this.add.text(290, 680, "▶", { fontSize:"24px", color:"#ffffff" }).setOrigin(0.5);
    this.carLabel = this.add.text(w/2, 652, "AUTO", { fontSize:"13px", color:"#9dc7eb" }).setOrigin(0.5);
    this.carText = this.add.text(w/2, 684, "", { fontSize:"18px", color:"#ffffff", align:"center" }).setOrigin(0.5);

    this.btnStart = this.add.rectangle(w/2, 736, 220, 58, 0x2bdc4a, 1).setInteractive();
    this.btnStartTxt = this.add.text(w/2, 736, "ŠTART", { fontSize:"22px", color:"#10210c", fontStyle:"bold" }).setOrigin(0.5);

    this.countryContainer.add([
      this.btnBack, this.btnBackTxt,
      this.btnCarPrev, this.btnCarNext,
      this.btnCarPrevTxt, this.btnCarNextTxt,
      this.carLabel, this.carText,
      this.btnStart, this.btnStartTxt
    ]);

    this.btnCarPrev.on("pointerdown", ()=>{
      this.carIndex = (this.carIndex - 1 + CARS.length) % CARS.length;
      this.selectedCar = CARS[this.carIndex];
      this.refreshCarText();
    });
    this.btnCarNext.on("pointerdown", ()=>{
      this.carIndex = (this.carIndex + 1) % CARS.length;
      this.selectedCar = CARS[this.carIndex];
      this.refreshCarText();
    });
    this.btnStart.on("pointerdown", ()=> this.startGame());

    this.refreshCarText();
    this.refreshCountryCards();
  }

  makeContinent(key, x, y, w, h, color, label, locked){
    const body = this.add.ellipse(x, y, w, h, color, 1).setStrokeStyle(2, 0x1e4422, 0.25);
    const txt = this.add.text(x, y + h/2 + 16, label, { fontSize:"11px", color:"#e8f6ff" }).setOrigin(0.5);
    const lockBadge = locked ? this.add.text(x, y, "🔒", { fontSize:"18px" }).setOrigin(0.5) : null;
    body.setInteractive({ useHandCursor: !locked });
    body.on("pointerdown", ()=>{
      if (locked) return;
      this.selectedContinent = key;
      this.setMenuStep("country");
    });
    this.continentNodes[key] = { body, txt, lockBadge, locked };
    this.atlasContainer.add([body, txt]);
    if (lockBadge) this.atlasContainer.add(lockBadge);
  }

  createCountryCard(order, y, name, locked, onClick){
    const rect = this.add.rectangle(VIEW_W/2, y, 230, 50, locked ? 0x19354f : 0x245f2a, 1)
      .setStrokeStyle(2, locked ? 0x315879 : 0x7cff75, locked ? 0.35 : 0.5)
      .setInteractive({ useHandCursor: !locked });
    const label = this.add.text(VIEW_W/2, y, locked ? `${name}  🔒` : name, {
      fontSize:"18px", color: locked ? "#8db2d2" : "#ffffff", fontStyle: locked ? "normal" : "bold"
    }).setOrigin(0.5);

    if (!locked && onClick) rect.on("pointerdown", onClick);

    this.countryContainer.add([rect, label]);
    this.countryCards.push({ rect, label, locked, name, mapId: locked ? null : "si" });
  }

  setMenuStep(step){
    this.menuStep = step;
    const atlas = step === "atlas";
    const country = step === "country";

    this.atlasContainer.setVisible(atlas);
    this.countryContainer.setVisible(country);

    this.menuTitle.setText(atlas ? "Vyber mapu" : "Európa");
    this.menuSubtitle.setText(atlas ? "Atlas sveta" : "Klikni na krajinu");

    this.highlightEurope();
    this.refreshCarText();
    this.refreshCountryCards();
  }

  highlightEurope(){
    Object.entries(this.continentNodes).forEach(([key, node])=>{
      const active = key === "eu";
      if (active) {
        node.body.setFillStyle(0x7be36c, 1);
        node.body.setStrokeStyle(3, 0xffffff, 0.55);
      } else {
        node.body.setFillStyle(0x477b35, 1);
        node.body.setStrokeStyle(2, 0x1e4422, 0.25);
      }
    });
  }

  refreshCountryCards(){
    this.countryCards.forEach(card=>{
      if (card.locked) return;
      const active = this.selectedMap && this.selectedMap.id === card.mapId;
      card.rect.setFillStyle(active ? 0x2b8a35 : 0x245f2a, 1);
      card.rect.setStrokeStyle(2, 0x7cff75, active ? 0.95 : 0.5);
      card.label.setText(active ? `${card.name} ✓` : card.name);
    });
  }

  refreshCarText(){
    this.carText.setText(`${this.selectedCar.name} · max ${this.selectedCar.maxSpeed}`);
  }

  createInputHandlers(){
    this.input.on("pointerdown", (p)=>{
      if (this.state !== "playing") return;

      if (this.isPointerOnWheel(p)) {
        this.wheel.active = true;
        this.wheel.id = p.id;
        this.updateWheelFromPointer(p);
        return;
      }

      if (this.isPointerOnGas(p)) return;

      if ((this.car?.body?.speed || 0) < 10) {
        this.cameraDrag.active = true;
        this.cameraDrag.id = p.id;
        this.cameraDrag.lastX = p.x;
        this.cameraDrag.lastY = p.y;
      }
    });

    this.input.on("pointermove", (p)=>{
      if (this.state !== "playing") return;

      if (this.wheel.active && p.id === this.wheel.id) {
        this.updateWheelFromPointer(p);
        return;
      }

      if (this.cameraDrag.active && p.id === this.cameraDrag.id && (this.car?.body?.speed || 0) < 10) {
        const dx = p.x - this.cameraDrag.lastX;
        const dy = p.y - this.cameraDrag.lastY;
        this.cameraDrag.lastX = p.x;
        this.cameraDrag.lastY = p.y;

        const cam = this.cameras.main;
        cam.scrollX = clamp(cam.scrollX - dx, 0, Math.max(0, this.worldW - VIEW_W));
        cam.scrollY = clamp(cam.scrollY - dy, 0, Math.max(0, this.worldH - VIEW_H));
      }
    });

    this.input.on("pointerup", (p)=> this.releasePointer(p));
    this.input.on("pointerupoutside", (p)=> this.releasePointer(p));

    this.input.keyboard.on("keydown-G", ()=>{
      if (this.state !== "playing") return;
      this.gridVisible = !this.gridVisible;
      if (this.gridLayer) this.gridLayer.setVisible(this.gridVisible);
    });
  }

  releasePointer(p){
    if (this.wheel.active && (!p || p.id === this.wheel.id)) {
      this.wheel.active = false;
      this.wheel.id = null;
      this.steer = 0;
      this.rotateWheelVisual(-Math.PI/2);
    }
    if (this.cameraDrag.active && (!p || p.id === this.cameraDrag.id)) {
      this.cameraDrag.active = false;
      this.cameraDrag.id = null;
    }
    if (!p || this.isPointerOnGas(p)) this.touch.gas = false;
  }

  isPointerOnWheel(p){
    return Math.hypot(p.x - this.wheel.cx, p.y - this.wheel.cy) <= this.wheel.r;
  }

  isPointerOnGas(p){
    return Math.hypot(p.x - (VIEW_W-88), p.y - (VIEW_H-82)) <= 54;
  }

  updateWheelFromPointer(p){
    const dx = p.x - this.wheel.cx;
    const dy = p.y - this.wheel.cy;
    let angle = Math.atan2(dy, dx);
    angle = clamp(angle, -2.55, -0.59);

    this.wheel.angle = angle;
    this.rotateWheelVisual(angle);

    const t = (angle + Math.PI/2) / 0.98;
    this.steer = clamp(t, -1, 1);
  }

  rotateWheelVisual(angle){
    const spokeAngle = angle + Math.PI/2;
    const knobRadius = this.wheel.r - 16;
    this.wheelKnob.setPosition(
      this.wheel.cx + Math.cos(angle) * knobRadius,
      this.wheel.cy + Math.sin(angle) * knobRadius
    );
    this.wheelSpokeA.setRotation(spokeAngle);
    this.wheelSpokeB.setRotation(spokeAngle - 2.12);
    this.wheelSpokeC.setRotation(spokeAngle + 2.12);
  }

  setState(s){
    this.state = s;
    const showMenu = s === "menu";
    const playing = s === "playing";

    this.menuContainer.setVisible(showMenu);

    [
      this.wheelBase, this.wheelRing, this.wheelSpokeA, this.wheelSpokeB, this.wheelSpokeC,
      this.wheelHub, this.wheelKnob, this.gasBtn, this.gasTxt
    ].forEach(o => o.setVisible(playing));

    if (showMenu) {
      this.uiInfo.setText("Vyber Európu → Slovinsko.");
      this.lightDot.setFillStyle(0x2bdc4a);
      this.touch.gas = false;
    } else {
      this.lightDot.setFillStyle(0xffc93a);
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
    const cols = Math.max(...grid.map(s=>s.length));
    return grid.map(line => line.padEnd(cols, "."));
  }

  isLandCell(grid, x, y){
    if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return false;
    return ["#", "S", "F"].includes(grid[y][x]);
  }

  findCell(grid, ch){
    for (let y=0; y<grid.length; y++) {
      for (let x=0; x<grid[y].length; x++) {
        if (grid[y][x] === ch) return {x, y};
      }
    }
    return null;
  }

  findSafeLand(grid){
    for (let y=1; y<grid.length-1; y++) {
      for (let x=1; x<grid[y].length-1; x++) {
        if (this.isLandCell(grid, x, y)) return {x, y};
      }
    }
    for (let y=0; y<grid.length; y++) {
      for (let x=0; x<grid[y].length; x++) {
        if (this.isLandCell(grid, x, y)) return {x, y};
      }
    }
    return {x:1,y:1};
  }

  findGoalCell(grid, startCell){
    const found = this.findCell(grid, "F");
    const candidate = found && this.isGoalUsable(grid, found.x, found.y) ? found : null;
    if (candidate) return candidate;

    let best = null;
    for (let y=1; y<grid.length-1; y++) {
      for (let x=1; x<grid[y].length-1; x++) {
        if (!this.isGoalUsable(grid, x, y)) continue;
        const d = Math.abs(x - startCell.x) + Math.abs(y - startCell.y);
        if (!best || d > best.dist) best = { x, y, dist:d };
      }
    }
    return best ? { x:best.x, y:best.y } : this.findSafeLand(grid);
  }

  isGoalUsable(grid, x, y){
    if (!this.isLandCell(grid, x, y)) return false;
    return this.isLandCell(grid, x-1, y) && this.isLandCell(grid, x+1, y) && this.isLandCell(grid, x, y-1) && this.isLandCell(grid, x, y+1);
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

    for (let y=0; y<rows; y++) {
      for (let x=0; x<cols; x++) {
        const ch = grid[y][x];
        const cx = x*CELL + CELL/2;
        const cy = y*CELL + CELL/2;
        const isLand = this.isLandCell(grid, x, y);

        const tile = this.add.image(cx, cy, isLand ? "tex_land" : "tex_ocean");
        this.landLayer.add(tile);

        if (!isLand) {
          const wall = this.add.rectangle(cx, cy, CELL, CELL, 0x000000, 0);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        }
      }
    }

    this.gridLayer = this.add.graphics();
    this.gridLayer.setVisible(this.gridVisible);
    this.gridLayer.lineStyle(1, 0xffffff, 0.12);
    for (let y=0; y<=rows; y++) this.gridLayer.lineBetween(0, y*CELL, this.worldW, y*CELL);
    for (let x=0; x<=cols; x++) this.gridLayer.lineBetween(x*CELL, 0, x*CELL, this.worldH);
    this.gridLayer.setDepth(10);

    const startCell = this.findCell(grid, "S") || this.findSafeLand(grid);
    const finishCell = this.findGoalCell(grid, startCell);

    const sx = startCell.x*CELL + CELL/2;
    const sy = startCell.y*CELL + CELL/2;
    const fx = finishCell.x*CELL + CELL/2;
    const fy = finishCell.y*CELL + CELL/2;

    this.landLayer.add(this.add.rectangle(sx, sy, CELL*0.92, 10, 0xffffff, 1));
    this.landLayer.add(this.add.rectangle(fx, fy, CELL*0.78, CELL*0.78, 0xf7e65e, 0.92).setStrokeStyle(2, 0xffffff, 0.8));

    this.finishZone = this.add.zone(fx, fy, CELL*0.78, CELL*0.78);
    this.physics.add.existing(this.finishZone, true);

    const landCells = [];
    for (let y=1; y<rows-1; y++) {
      for (let x=1; x<cols-1; x++) {
        if (grid[y][x] === "#") landCells.push({x,y});
      }
    }
    Phaser.Utils.Array.Shuffle(landCells);
    const obsCount = Math.min(8, Math.floor(landCells.length * 0.06));
    for (let i=0; i<obsCount; i++) {
      const c = landCells[i];
      if (!c) continue;
      if ((c.x === startCell.x && c.y === startCell.y) || (c.x === finishCell.x && c.y === finishCell.y)) continue;
      const ox = c.x*CELL + CELL/2;
      const oy = c.y*CELL + CELL/2;
      const block = this.add.rectangle(ox, oy, 64, 26, 0xd99a22, 1);
      block.setRotation(i % 2 === 0 ? 0 : Math.PI/2);
      this.physics.add.existing(block, true);
      this.obstacles.add(block);
    }

    const baseW = 34, baseH = 54;
    const wMul = this.selectedCar.widthMul || 1;
    const hMul = this.selectedCar.heightMul || 1;

    this.car = this.physics.add.image(sx, sy, "tex_car");
    this.car.setTint(this.selectedCar.color);
    this.car.setDisplaySize(baseW*wMul, baseH*hMul);
    this.car.body.setSize(baseW*wMul, baseH*hMul, true);
    this.car.setDrag(300, 300);
    this.car.setCollideWorldBounds(true);
    this.car.body.setMaxVelocity(this.selectedCar.maxSpeed, this.selectedCar.maxSpeed);
    this.car.body.setAngularVelocity(0);
    this.car.rotation = 0;

    this.physics.add.collider(this.car, this.wallGroup, ()=>this.onCrash(), null, this);
    this.physics.add.collider(this.car, this.obstacles, ()=>this.onCrash(), null, this);
    this.physics.add.overlap(this.car, this.finishZone, ()=>this.onFinish(), null, this);

    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.startFollow(this.car, true, 0.16, 0.16);
    this.cameras.main.setDeadzone(52, 72);
  }

  startGame(){
    this.money = 0;
    this.finishTriggered = false;
    this.steer = 0;
    this.wheel.active = false;
    this.cameraDrag.active = false;
    this.touch.gas = false;
    this.rotateWheelVisual(-Math.PI/2);

    this.buildWorld(this.selectedMap);
    this.uiInfo.setText(`Mapa: ${this.selectedMap.name} • Auto: ${this.selectedCar.name}`);
    this.setState("playing");
  }

  onCrash(){
    if (this.state !== "playing") return;
    this.money = Math.max(0, this.money - RULES.crashPenalty);
    this.uiInfo.setText(`💥 Náraz (-${RULES.crashPenalty})`);
  }

  onFinish(){
    if (this.state !== "playing" || this.finishTriggered) return;
    this.finishTriggered = true;

    this.money += RULES.finishReward;
    this.best = Math.max(this.best, this.money);
    this.playWinSound();

    this.uiInfo.setText(`🏁 CIEĽ! Peniaze: ${this.money} (best: ${this.best})`);
    this.setState("menu");
    this.setMenuStep("country");

    this.cameras.main.stopFollow();
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;

    this.time.delayedCall(120, ()=>{
      this.clearWorld();
      this.finishTriggered = false;
    });
  }

  playWinSound(){
    const ctx = this.sound.context;
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i)=>{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + i*0.08);
      gain.gain.setValueAtTime(0.0001, now + i*0.08);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i*0.08 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i*0.08 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i*0.08);
      osc.stop(now + i*0.08 + 0.2);
    });
  }

  update(_, delta){
    this.uiMoney.setText(`Peníze: ${this.money}`);
    if (this.state !== "playing" || !this.car) return;

    const dt = delta / 1000;
    const gas = this.touch.gas || this.cursors.up.isDown;

    let kbSteer = 0;
    if (this.cursors.left.isDown) kbSteer -= 1;
    if (this.cursors.right.isDown) kbSteer += 1;

    const steer = clamp(this.wheel.active ? this.steer : (kbSteer !== 0 ? kbSteer : 0), -1, 1);
    const speed = this.car.body.speed || 0;
    const speedN = clamp(speed / (this.selectedCar.maxSpeed * 0.22), 0, 1);

    if (speed > 2) {
      const turnRate = 3.35;
      this.car.rotation += steer * turnRate * dt * speedN;
    }

    this.car.body.setAngularVelocity(0);

    if (gas) {
      const angleDeg = (this.car.rotation * 180 / Math.PI) - 90;
      const desired = new Phaser.Math.Vector2();
      this.physics.velocityFromAngle(angleDeg, this.selectedCar.maxSpeed, desired);
      const accelLerp = clamp((this.selectedCar.accel || 560) / 720, 0.18, 0.34);
      this.car.body.velocity.x = Phaser.Math.Linear(this.car.body.velocity.x, desired.x, accelLerp);
      this.car.body.velocity.y = Phaser.Math.Linear(this.car.body.velocity.y, desired.y, accelLerp);
      this.cameras.main.startFollow(this.car, true, 0.16, 0.16);
      this.cameraDrag.active = false;
    } else if (speed < 12 && this.cameraDrag.active) {
      this.cameras.main.stopFollow();
    } else if (!this.cameraDrag.active) {
      this.cameras.main.startFollow(this.car, true, 0.16, 0.16);
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

  makeCarTexture(key, w, h){
    if (this.textures.exists(key)) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(4, 2, w-8, h-4, 10);
    g.fillStyle(0x4d4d4d, 1);
    g.fillRoundedRect(9, 10, w-18, h-20, 7);
    g.fillStyle(0x1a1a1a, 1);
    g.fillCircle(8, 12, 4);
    g.fillCircle(w-8, 12, 4);
    g.fillCircle(8, h-12, 4);
    g.fillCircle(w-8, h-12, 4);
    g.generateTexture(key, w, h);
    g.destroy();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "wrap",
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: "#07111c",
  physics: { default: "arcade", arcade: { debug: false } },
  scene: [MainScene],
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});

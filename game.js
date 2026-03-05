// Start–Cíl: Autíčka (v3) — Phaser 3
// ÚPRAVY PODĽA POŽIADAVKY:
// 1) Odstránené "šipky" z mapy (žiadne overlay šípky v strede).
// 2) Namiesto tlačidiel doľava/doprava je VOLANT (drag/ťahanie).
// 3) Odstránené všetky malé "pomlčky" na ceste (dash segmenty).
//
// OVLÁDANIE:
// - Plyn: tlačidlo ⛽ alebo šípka hore (↑)
// - Volant: ťahaj kruh vľavo dole (alebo šípky ← → na klávesnici)
// - G: zapnúť/vypnúť mriežku (debug tvaru mapy)

const VIEW_W = 390;
const VIEW_H = 780;

const CELL = 44;

// Autá
const CARS = [
  { id:"taxi",    name:"Taxi",    color:0xffd800, maxSpeed:230, accel:520 },
  { id:"motorka", name:"Motorka", color:0xFF69B4, maxSpeed:280, accel:560, widthMul:0.55, heightMul:0.85 },
  { id:"auto",    name:"Auto",    color:0xffffff, maxSpeed:240, accel:520, widthMul:1.0, heightMul:1.0 }
];

const RULES = {
  finishReward: 100,
  crashPenalty: 10,
};

const MAPS = {
  sk: { id:"sk", name:"Slovensko", grid: [
    "........................",
    "........................",
    "...........####.........",
    ".........#########......",
    ".......#############....",
    "......###############...",
    ".....#################..",
    "....##################..",
    "...###################..",
    "...###################..",
    "..####################..",
    "..####################..",
    "..###################...",
    "...#################....",
    "....###############.....",
    ".....#############......",
    "......###########.......",
    "........#######.........",
    "..........###...........",
    "...........S............",
    ".................F......",
    "........................",
    "........................",
    "........................"
  ]},
  cz: { id:"cz", name:"Česko", grid: [
    "........................",
    "........................",
    "........##########......",
    "......##############....",
    ".....###############....",
    "....################....",
    "...#################....",
    "...#################....",
    "...#################....",
    "...################.....",
    "....##############......",
    ".....############.......",
    "......###########.......",
    ".....#############......",
    "....###############.....",
    "...#################....",
    "...##################...",
    "....#################...",
    ".....###############....",
    "......############......",
    "...........S............",
    "..............F.........",
    "........................",
    "........................"
  ]},
  dk: { id:"dk", name:"Dánsko", grid: [
    "........................",
    "...........###..........",
    "..........#####.........",
    "..........######........",
    "..........######........",
    ".........#######........",
    "........########........",
    ".......#########........",
    "......##########........",
    ".....###########........",
    "....############........",
    "...#############........",
    "..##############........",
    "..#############.........",
    "...###########..........",
    "....#########...........",
    ".....#######............",
    "......#####.....###.....",
    ".......###.....#####....",
    "........S......#####....",
    "...............####.....",
    ".................F......",
    "........................",
    "........................"
  ]}
};

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

class MainScene extends Phaser.Scene {
  constructor(){ super("main"); }

  init(){
    this.state = "menu";
    this.money = 0;
    this.best = 0;

    this.carIndex = 0;
    this.mapKeys = Object.keys(MAPS);
    this.mapIndex = 0;

    this.selectedCar = CARS[this.carIndex];
    this.selectedMap = MAPS[this.mapKeys[this.mapIndex]];

    this.gridVisible = false;

    // volant (steer) -1..1
    this.steer = 0;
    this.wheel = { active:false, id:null, cx:110, cy:VIEW_H-95, r:70 };
  }

  create(){
    this.makeRectTexture("tex_car", 34, 54, 0xffffff);
    this.makeRectTexture("tex_wall", CELL, CELL, 0x0b2a4a);
    this.makeRectTexture("tex_road", CELL, CELL, 0x202020);

    // UI
    this.uiTitle = this.add.text(VIEW_W/2, 16, "Start–Cíl: Autíčka", { fontSize:"18px", color:"#fff" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    this.uiMoney = this.add.text(12, 46, "Peníze: 0", { fontSize:"16px", color:"#fff" })
      .setScrollFactor(0).setDepth(1000);
    this.uiInfo  = this.add.text(12, 70, "", { fontSize:"14px", color:"#ccc" })
      .setScrollFactor(0).setDepth(1000);

    // Semafor UI (zostal)
    this.add.rectangle(VIEW_W-44, 56, 56, 56, 0x0e0e0e).setScrollFactor(0).setDepth(1000);
    this.lightDot = this.add.circle(VIEW_W-44, 56, 16, 0x2bdc4a).setScrollFactor(0).setDepth(1001);

    // Keyboard
    this.cursors = this.input.keyboard.createCursorKeys();

    // Plyn (touch)
    this.touch = { gas:false };
    this.gasBtn = this.add.rectangle(VIEW_W-90, VIEW_H-80, 110, 110, 0x000000, 0.35)
      .setInteractive().setScrollFactor(0).setDepth(1000);
    this.add.text(VIEW_W-90, VIEW_H-80, "⛽", { fontSize:"34px", color:"#fff" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1001);

    this.gasBtn.on("pointerdown", ()=> this.touch.gas = true);
    this.gasBtn.on("pointerup",   ()=> this.touch.gas = false);
    this.gasBtn.on("pointerout",  ()=> this.touch.gas = false);

    // VOLANT UI
    this.wheelBase = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r, 0x000000, 0.30)
      .setScrollFactor(0).setDepth(1000).setInteractive();
    this.wheelRing = this.add.circle(this.wheel.cx, this.wheel.cy, this.wheel.r-10, 0xffffff, 0.06)
      .setScrollFactor(0).setDepth(1001);
    this.wheelKnob = this.add.circle(this.wheel.cx, this.wheel.cy - (this.wheel.r-16), 12, 0xffffff, 0.18)
      .setScrollFactor(0).setDepth(1002);

    // Volant input (drag)
    this.input.on("pointerdown", (p)=>{
      if (this.state !== "playing") return;
      const dx = p.x - this.wheel.cx;
      const dy = p.y - this.wheel.cy;
      if (Math.hypot(dx,dy) <= this.wheel.r){
        this.wheel.active = true;
        this.wheel.id = p.id;
        this.updateWheelFromPointer(p);
      }
    });

    this.input.on("pointermove", (p)=>{
      if (this.state !== "playing") return;
      if (!this.wheel.active || p.id !== this.wheel.id) return;
      this.updateWheelFromPointer(p);
    });

    this.input.on("pointerup", (p)=>{
      if (!this.wheel.active || p.id !== this.wheel.id) return;
      this.wheel.active = false;
      this.wheel.id = null;
      // vráť volant do stredu
      this.steer = 0;
      this.wheelKnob.setPosition(this.wheel.cx, this.wheel.cy - (this.wheel.r-16));
    });

    // G = grid overlay
    this.input.keyboard.on("keydown-G", ()=>{
      if (this.state !== "playing") return;
      this.gridVisible = !this.gridVisible;
      if (this.gridLayer) this.gridLayer.setVisible(this.gridVisible);
    });

    // Menu
    this.buildMenu();

    // Physics bounds placeholder
    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);

    this.refreshMenuTexts();
    this.setState("menu");
  }

  updateWheelFromPointer(p){
    const dx = p.x - this.wheel.cx;
    const dy = p.y - this.wheel.cy;

    // drž knob na kružnici
    const r = this.wheel.r - 16;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    this.wheelKnob.setPosition(this.wheel.cx + nx*r, this.wheel.cy + ny*r);

    // steering podľa vodorovnej odchýlky (jemné, stabilné)
    const steerRaw = clamp(dx / this.wheel.r, -1, 1);
    this.steer = steerRaw;
  }

  // ---------- MENU ----------
  buildMenu(){
    const w = VIEW_W, h = VIEW_H;

    this.menuBg = this.add.rectangle(w/2, h/2, w*0.92, h*0.70, 0x000000, 0.72).setScrollFactor(0).setDepth(2000);
    this.menuTitle = this.add.text(w/2, h/2 - 240, "Vyber auto a mapu", { fontSize:"22px", color:"#fff" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.menuCarLabel = this.add.text(w/2, h/2 - 180, "AUTO", { fontSize:"14px", color:"#bdbdbd" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    this.menuCarText  = this.add.text(w/2, h/2 - 150, "", { fontSize:"18px", color:"#fff", align:"center" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.btnCarPrev = this.add.rectangle(w/2-120, h/2 - 110, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.btnCarNext = this.add.rectangle(w/2+120, h/2 - 110, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(w/2-120, h/2 - 110, "◀", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);
    this.add.text(w/2+120, h/2 - 110, "▶", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    this.menuMapLabel = this.add.text(w/2, h/2 - 55, "MAPA", { fontSize:"14px", color:"#bdbdbd" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    this.menuMapText  = this.add.text(w/2, h/2 - 25, "", { fontSize:"18px", color:"#fff", align:"center" })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.btnMapPrev = this.add.rectangle(w/2-120, h/2 + 15, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.btnMapNext = this.add.rectangle(w/2+120, h/2 + 15, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(w/2-120, h/2 + 15, "◀", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);
    this.add.text(w/2+120, h/2 + 15, "▶", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    this.btnStart = this.add.rectangle(w/2, h/2 + 125, 240, 66, 0x2bdc4a, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(w/2, h/2 + 125, "START", { fontSize:"22px", color:"#111" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    this.menuHint = this.add.text(
      w/2, h/2 + 195,
      "Plyn: ⛽ / ↑ • Volant: kruh vľavo dole / ← →\nG = mriežka",
      { fontSize:"13px", color:"#cfcfcf", align:"center" }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

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

    this.btnMapPrev.on("pointerdown", ()=>{
      this.mapIndex = (this.mapIndex - 1 + this.mapKeys.length) % this.mapKeys.length;
      this.selectedMap = MAPS[this.mapKeys[this.mapIndex]];
      this.refreshMenuTexts();
    });
    this.btnMapNext.on("pointerdown", ()=>{
      this.mapIndex = (this.mapIndex + 1) % this.mapKeys.length;
      this.selectedMap = MAPS[this.mapKeys[this.mapIndex]];
      this.refreshMenuTexts();
    });

    this.btnStart.on("pointerdown", ()=> this.startGame());
  }

  refreshMenuTexts(){
    const c = this.selectedCar;
    this.menuCarText.setText(`${c.name}\nmax ${c.maxSpeed}`);
    const m = this.selectedMap;
    this.menuMapText.setText(`${m.name}`);
  }

  setState(s){
    this.state = s;
    const show = (s === "menu");
    [
      this.menuBg, this.menuTitle,
      this.menuCarLabel, this.menuCarText,
      this.btnCarPrev, this.btnCarNext,
      this.menuMapLabel, this.menuMapText,
      this.btnMapPrev, this.btnMapNext,
      this.btnStart, this.menuHint
    ].forEach(o => o.setVisible(show));

    // volant + plyn iba pri hre
    const playing = (s === "playing");
    this.wheelBase.setVisible(playing);
    this.wheelRing.setVisible(playing);
    this.wheelKnob.setVisible(playing);
    this.gasBtn.setVisible(playing);

    if (show){
      this.uiInfo.setText("Dojeď do cíle. Peníze dostaneš až na konci.");
      this.lightDot.setFillStyle(0x2bdc4a);
    }
  }

  // ---------- WORLD BUILD ----------
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

  buildWorld(mapDef){
    this.clearWorld();

    const grid = mapDef.grid;
    const rows = grid.length;
    const cols = grid[0].length;

    this.worldW = cols * CELL;
    this.worldH = rows * CELL;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    this.landLayer = this.add.container(0,0);
    this.wallGroup = this.physics.add.staticGroup();
    this.obstacles = this.physics.add.staticGroup();

    let startCell = null;
    let finishCell = null;

    for (let y=0; y<rows; y++){
      const line = grid[y];
      for (let x=0; x<cols; x++){
        const ch = line[x];
        const cx = x * CELL + CELL/2;
        const cy = y * CELL + CELL/2;

        const isLand = (ch === "#" || ch === "S" || ch === "F");
        if (isLand){
          const t = this.add.image(cx, cy, "tex_road");
          this.landLayer.add(t);

          if (ch === "S") startCell = {x, y};
          if (ch === "F") finishCell = {x, y};
        } else {
          const t = this.add.image(cx, cy, "tex_wall");
          this.landLayer.add(t);

          const wall = this.add.rectangle(cx, cy, CELL, CELL, 0x000000, 0);
          this.physics.add.existing(wall, true);
          this.wallGroup.add(wall);
        }
      }
    }

    // GRID overlay (debug)
    this.gridLayer = this.add.graphics();
    this.gridLayer.setVisible(this.gridVisible);
    this.gridLayer.lineStyle(1, 0xffffff, 0.10);
    for (let y=0; y<=rows; y++) this.gridLayer.lineBetween(0, y*CELL, this.worldW, y*CELL);
    for (let x=0; x<=cols; x++) this.gridLayer.lineBetween(x*CELL, 0, x*CELL, this.worldH);
    this.gridLayer.setDepth(10);

    const s = startCell || { x: Math.floor(cols/2), y: rows-2 };
    const f = finishCell || { x: Math.floor(cols/2), y: 1 };

    const sx = s.x*CELL + CELL/2;
    const sy = s.y*CELL + CELL/2;
    const fx = f.x*CELL + CELL/2;
    const fy = f.y*CELL + CELL/2;

    // Start / Finish línie
    this.landLayer.add(this.add.rectangle(sx, sy, CELL*0.92, 10, 0xffffff, 1));
    this.landLayer.add(this.add.rectangle(fx, fy, CELL*0.92, 8, 0x4ea3ff, 1));

    this.finishZone = this.add.zone(fx, fy, CELL*0.92, CELL*0.92);
    this.physics.add.existing(this.finishZone, true);

    // jednoduché prekážky
    const landCells = [];
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const ch = grid[y][x];
        if (ch === "#" && !(x === s.x && y === s.y) && !(x === f.x && y === f.y)) landCells.push({x,y});
      }
    }
    Phaser.Utils.Array.Shuffle(landCells);
    const obsCount = Math.min(10, Math.floor(landCells.length * 0.08));
    for (let i=0; i<obsCount; i++){
      const c = landCells[i];
      const ox = c.x*CELL + CELL/2;
      const oy = c.y*CELL + CELL/2;
      const r = this.add.rectangle(ox, oy, 70, 30, 0xffb020, 1);
      r.setRotation((i%2===0)?0:Math.PI/2);
      this.physics.add.existing(r, true);
      this.obstacles.add(r);
    }

    // car
    const baseW = 34, baseH = 54;
    const wMul = this.selectedCar.widthMul || 1;
    const hMul = this.selectedCar.heightMul || 1;

    this.car = this.physics.add.image(sx, sy + CELL*0.35, "tex_car");
    this.car.setTint(this.selectedCar.color);
    this.car.setDisplaySize(baseW*wMul, baseH*hMul);
    this.car.body.setSize(baseW*wMul, baseH*hMul, true);
    this.car.setDrag(280, 280);
    this.car.setCollideWorldBounds(true);
    this.car.body.setMaxVelocity(this.selectedCar.maxSpeed, this.selectedCar.maxSpeed);

    this.physics.add.collider(this.car, this.wallGroup, ()=>this.onCrash(), null, this);
    this.physics.add.collider(this.car, this.obstacles, ()=>this.onCrash(), null, this);
    this.physics.add.overlap(this.car, this.finishZone, ()=>this.onFinish(), null, this);

    this.cameras.main.setBounds(0,0,this.worldW,this.worldH);
    this.cameras.main.startFollow(this.car, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(40, 60);
  }

  startGame(){
    this.money = 0;
    this.steer = 0;
    this.wheel.active = false;
    this.wheel.id = null;

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
    if (this.state !== "playing") return;

    this.money += RULES.finishReward;
    this.best = Math.max(this.best, this.money);

    this.uiInfo.setText(`🏁 CÍL! Peníze: ${this.money} (best: ${this.best})`);
    this.setState("menu");

    this.cameras.main.stopFollow();
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;

    this.clearWorld();
  }

  update(_, delta){
    this.uiMoney.setText(`Peníze: ${this.money}`);
    if (this.state !== "playing") return;

    // vstupy
    const gas  = this.touch.gas || this.cursors.up.isDown;

    // keyboard steer fallback
    let kbSteer = 0;
    if (this.cursors.left.isDown) kbSteer -= 1;
    if (this.cursors.right.isDown) kbSteer += 1;

    const steer = clamp(this.steer + kbSteer, -1, 1);

    // zatáčanie
    const turnSpeed = 220; // deg/s (Arcade angular velocity is deg/s)
    this.car.body.setAngularVelocity(steer * turnSpeed);

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

// Start–Cíl: Autíčka (v2) — Phaser 3
// ZMENY:
// 1) Skutočný "world" väčší než obrazovka + kamera sleduje auto (mapa pokračuje za okraj).
// 2) V menu je výber AUTA aj MAPY (Slovensko / Česko / Dánsko).
// 3) Mapu vieš jednoducho upraviť cez GRID "ASCII mapu" nižšie (znaky '#', '.', 'S', 'F').
//
// Ako upravovať mapu (najľahšie):
// - MAPS.<krajina>.grid je pole stringov rovnakej dĺžky.
// - '#' = jazditeľná plocha (zem / cesta)
// - '.' = nepriechodné (voda / mimo mapy) => auto do toho nenarazí? (narazí do "wall")
// - 'S' = štart (jedno miesto)
// - 'F' = cieľ (jedno miesto)
// Tip: stačí meniť tvary # tak, aby pripomínali hranice štátu.
// Bonus: Stlač G počas hry => zapne/vypne sa GRID overlay (na ladenie tvaru).

const VIEW_W = 390;
const VIEW_H = 780;

// Veľkosť jedného grid políčka v pixeloch (čím väčšie, tým menej "stien")
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
  redLightPenaltyPerSec: 12,
};

// --- GRID MAPY ---
// Pozn.: Sú to zjednodušené obrysy. Uprav 'grid' (#) aby viac sedeli na hranice.
const MAPS = {
  sk: {
    id: "sk",
    name: "Slovensko",
    // 24 x 24
    grid: [
      "................................................................................",
      "................................................................................",
      "...................................###..........................................",
      "..........................###.....#####.........................................",
      ".......................#######....######....................###................",
      ".......................#####.....######................###########.............",
      "......................######.....######..............###############...........",
      ".....................###################............##################.........",
      "...................######################..........####################........",
      "..................#######################.........#####################........",
      "..................########################......#######################........",
      "..................######################################################.......",
      ".................########################################################......",
      "...............##########################################################......",
      "..............###########################################################......",
      "............############################################################.......",
      "....####################################################################.......",
      "....####################################################################.......",
      "...#####################################################################.......",
      "...####################################################################........",
      "..####################################################################.........",
      "..###########################################################..#######.........",
      "..##########################################################....######.........",
      ".##########################################################......#####.........",
      ".#########################################################.......#####.........",
      ".########################################################........#####.........",
      ".#######################################################..........###..........",
      "..#####################################################.........................",
      "..#############################################.................................",
      "...###########################################..................................",
      "....########################################....................................",
      ".....#####################################......................................",
      ".......##################################.......................................",
      ".........################################.......................................",
      ".........################################.......................................",
      "..........##############################.......................................",
      "..............########################.........................................",
      "................#####################..........................................",
      "....................##############.............................................",
      ".......................########................................................",
      "..........................####.................................................",
      "................................................................................",
      "................................................................................"
    ]
  },
  cz: {
    id: "cz",
    name: "Česko",
    // 24 x 24
    grid: [
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
    ]
  },
  dk: {
    id: "dk",
    name: "Dánsko",
    // 24 x 24 — zjednodušené "Jutland + ostrovy"
    grid: [
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
    ]
  }
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

    this.redLight = false;
    this.penaltyTimer = 0;

    this.gridVisible = false;
  }

  create(){
    // pomocné textúry
    this.makeRectTexture("tex_car", 34, 54, 0xffffff);
    this.makeRectTexture("tex_wall", CELL, CELL, 0x0b2a4a);
    this.makeRectTexture("tex_land", CELL, CELL, 0x2a2a2a);
    this.makeRectTexture("tex_road", CELL, CELL, 0x202020);

    // UI (fixné na obrazovku)
    this.uiTitle = this.add.text(VIEW_W/2, 16, "Start–Cíl: Autíčka", { fontSize:"18px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(1000);
    this.uiMoney = this.add.text(12, 46, "Peníze: 0", { fontSize:"16px", color:"#fff" }).setScrollFactor(0).setDepth(1000);
    this.uiInfo  = this.add.text(12, 70, "", { fontSize:"14px", color:"#ccc" }).setScrollFactor(0).setDepth(1000);

    // Semafor (fixný)
    this.add.rectangle(VIEW_W-44, 56, 56, 56, 0x0e0e0e).setScrollFactor(0).setDepth(1000);
    this.lightDot = this.add.circle(VIEW_W-44, 56, 16, 0x2bdc4a).setScrollFactor(0).setDepth(1001);

    // Ovládanie (fixné)
    this.cursors = this.input.keyboard.createCursorKeys();
    this.touch = { left:false, right:false, gas:false };

    const btn=(x,y,label)=>{
      const b=this.add.rectangle(x,y,110,110,0x000000,0.35).setInteractive().setScrollFactor(0).setDepth(1000);
      this.add.text(x,y,label,{fontSize:"34px",color:"#fff"}).setOrigin(0.5).setScrollFactor(0).setDepth(1001);
      return b;
    };
    this.leftBtn  = btn(70, VIEW_H-70, "◀");
    this.rightBtn = btn(200, VIEW_H-70, "▶");
    this.gasBtn   = btn(VIEW_W-90, VIEW_H-80, "⛽");

    const set=(k,v)=>()=>this.touch[k]=v;
    this.leftBtn.on("pointerdown", set("left", true));
    this.leftBtn.on("pointerup",   set("left", false));
    this.rightBtn.on("pointerdown",set("right",true));
    this.rightBtn.on("pointerup",  set("right",false));
    this.gasBtn.on("pointerdown",  set("gas", true));
    this.gasBtn.on("pointerup",    set("gas", false));

    // G = grid overlay
    this.input.keyboard.on("keydown-G", ()=>{
      if (this.state !== "playing") return;
      this.gridVisible = !this.gridVisible;
      if (this.gridLayer) this.gridLayer.setVisible(this.gridVisible);
    });

    // menu overlay
    this.buildMenu();

    // semafor cycle
    this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: ()=>{
        if (this.state !== "playing") return;
        this.redLight = !this.redLight;
        this.lightDot.setFillStyle(this.redLight ? 0xff3b30 : 0x2bdc4a);
      }
    });

    // Physics default
    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);

    this.refreshMenuTexts();
    this.setState("menu");
  }

  // ---------- MENU ----------
  buildMenu(){
    const w = VIEW_W, h = VIEW_H;

    this.menuBg = this.add.rectangle(w/2, h/2, w*0.92, h*0.70, 0x000000, 0.72).setScrollFactor(0).setDepth(2000);
    this.menuTitle = this.add.text(w/2, h/2 - 240, "Vyber auto a mapu", { fontSize:"22px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    // Car
    this.menuCarLabel = this.add.text(w/2, h/2 - 180, "AUTO", { fontSize:"14px", color:"#bdbdbd" }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    this.menuCarText  = this.add.text(w/2, h/2 - 150, "", { fontSize:"18px", color:"#fff", align:"center" }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.btnCarPrev = this.add.rectangle(w/2-120, h/2 - 110, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.btnCarNext = this.add.rectangle(w/2+120, h/2 - 110, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(w/2-120, h/2 - 110, "◀", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);
    this.add.text(w/2+120, h/2 - 110, "▶", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    // Map
    this.menuMapLabel = this.add.text(w/2, h/2 - 55, "MAPA", { fontSize:"14px", color:"#bdbdbd" }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    this.menuMapText  = this.add.text(w/2, h/2 - 25, "", { fontSize:"18px", color:"#fff", align:"center" }).setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    this.btnMapPrev = this.add.rectangle(w/2-120, h/2 + 15, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.btnMapNext = this.add.rectangle(w/2+120, h/2 + 15, 90, 54, 0x222, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(w/2-120, h/2 + 15, "◀", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);
    this.add.text(w/2+120, h/2 + 15, "▶", { fontSize:"26px", color:"#fff" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    // Start
    this.btnStart = this.add.rectangle(w/2, h/2 + 125, 240, 66, 0x2bdc4a, 1).setInteractive().setScrollFactor(0).setDepth(2001);
    this.add.text(w/2, h/2 + 125, "START", { fontSize:"22px", color:"#111" }).setOrigin(0.5).setScrollFactor(0).setDepth(2002);

    // Hint
    this.menuHint = this.add.text(
      w/2, h/2 + 195,
      "Ovládanie: šípky alebo tlačidlá\nG = zapnúť/vypnúť mriežku mapy",
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

    const menuEls = [
      this.menuBg, this.menuTitle,
      this.menuCarLabel, this.menuCarText,
      this.btnCarPrev, this.btnCarNext,
      this.menuMapLabel, this.menuMapText,
      this.btnMapPrev, this.btnMapNext,
      this.btnStart, this.menuHint
    ];
    menuEls.forEach(o => o.setVisible(show));

    if (show){
      this.uiInfo.setText("Dojeď do cíle. Peníze dostaneš až na konci.");
      this.lightDot.setFillStyle(0x2bdc4a);
    }
  }

  // ---------- WORLD BUILD ----------
  clearWorld(){
    // zmaž staré objekty (ak existujú)
    if (this.landLayer) this.landLayer.destroy(true);
    if (this.wallGroup) this.wallGroup.clear(true, true);
    if (this.obstacles) this.obstacles.clear(true, true);
    if (this.redZone) this.redZone.destroy();
    if (this.finishZone) this.finishZone.destroy();
    if (this.car) this.car.destroy();

    this.landLayer = null;
    this.wallGroup = null;
    this.obstacles = null;
    this.redZone = null;
    this.finishZone = null;
    this.car = null;

    if (this.gridLayer) this.gridLayer.destroy(true);
    this.gridLayer = null;
  }

  // Vygeneruje: world bounds, land tiles, wall tiles, start/finish, obstacles
  buildWorld(mapDef){
    this.clearWorld();

    const grid = mapDef.grid;
    const rows = grid.length;
    const cols = grid[0].length;

    // world size
    this.worldW = cols * CELL;
    this.worldH = rows * CELL;
    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);

    // pozadie (kamera "world")
    this.landLayer = this.add.container(0,0);

    // wall group (nepriechodné)
    this.wallGroup = this.physics.add.staticGroup();
    this.obstacles = this.physics.add.staticGroup();

    // start/finish fallback
    let startCell = null;
    let finishCell = null;

    // vykreslenie a steny
    for (let y=0; y<rows; y++){
      const line = grid[y];
      for (let x=0; x<cols; x++){
        const ch = line[x];
        const cx = x * CELL + CELL/2;
        const cy = y * CELL + CELL/2;

        const isLand = (ch === "#" || ch === "S" || ch === "F");
        if (isLand){
          // land tile (jazditeľné)
          const t = this.add.image(cx, cy, "tex_road");
          t.setAlpha(1);
          this.landLayer.add(t);

          // jemný "stredový pruh" pre pocit cesty (len na niektorých dlaždiciach)
          if ((x + y) % 6 === 0){
            const dash = this.add.rectangle(cx, cy, 8, 24, 0xf7e600, 0.85);
            dash.setRotation((x % 2) ? 0 : Math.PI/2);
            this.landLayer.add(dash);
          }

          if (ch === "S") startCell = {x, y};
          if (ch === "F") finishCell = {x, y};
        } else {
          // water/void tile vizuál + kolízia ako stena
          const t = this.add.image(cx, cy, "tex_wall");
          t.setAlpha(0.95);
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
    for (let y=0; y<=rows; y++){
      this.gridLayer.lineBetween(0, y*CELL, this.worldW, y*CELL);
    }
    for (let x=0; x<=cols; x++){
      this.gridLayer.lineBetween(x*CELL, 0, x*CELL, this.worldH);
    }
    this.gridLayer.setDepth(10);

    // start/finish zone
    const s = startCell || { x: Math.floor(cols/2), y: rows-2 };
    const f = finishCell || { x: Math.floor(cols/2), y: 1 };

    const sx = s.x*CELL + CELL/2;
    const sy = s.y*CELL + CELL/2;
    const fx = f.x*CELL + CELL/2;
    const fy = f.y*CELL + CELL/2;

    // vizuálne línie
    this.landLayer.add(this.add.rectangle(sx, sy, CELL*0.92, 10, 0xffffff, 1));
    this.landLayer.add(this.add.rectangle(fx, fy, CELL*0.92, 8, 0x4ea3ff, 1));

    this.redZone = this.add.zone(sx, sy + CELL*0.8, CELL*0.92, CELL*1.4);
    this.physics.add.existing(this.redZone, true);

    this.finishZone = this.add.zone(fx, fy, CELL*0.92, CELL*0.92);
    this.physics.add.existing(this.finishZone, true);

    // náhodné prekážky na zemi (len na land)
    const landCells = [];
    for (let y=0; y<rows; y++){
      for (let x=0; x<cols; x++){
        const ch = grid[y][x];
        if (ch === "#" && !(x === s.x && y === s.y) && !(x === f.x && y === f.y)){
          landCells.push({x,y});
        }
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
    const baseW = 34;
    const baseH = 54;
    const wMul = this.selectedCar.widthMul || 1;
    const hMul = this.selectedCar.heightMul || 1;

    this.car = this.physics.add.image(sx, sy + CELL*0.35, "tex_car");
    this.car.setTint(this.selectedCar.color);
    this.car.setDisplaySize(baseW*wMul, baseH*hMul);
    this.car.body.setSize(baseW*wMul, baseH*hMul, true);
    this.car.setDrag(280, 280);
    this.car.setCollideWorldBounds(true);
    this.car.body.setMaxVelocity(this.selectedCar.maxSpeed, this.selectedCar.maxSpeed);

    // collisions
    this.physics.add.collider(this.car, this.wallGroup, ()=>this.onCrash(), null, this);
    this.physics.add.collider(this.car, this.obstacles, ()=>this.onCrash(), null, this);
    this.physics.add.overlap(this.car, this.finishZone, ()=>this.onFinish(), null, this);

    // kamera follow
    this.cameras.main.setBounds(0,0,this.worldW,this.worldH);
    this.cameras.main.startFollow(this.car, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(40, 60);
  }

  startGame(){
    this.money = 0;
    this.penaltyTimer = 0;
    this.redLight = false;
    this.lightDot.setFillStyle(0x2bdc4a);

    this.buildWorld(this.selectedMap);

    this.uiInfo.setText(`Mapa: ${this.selectedMap.name} • Auto: ${this.selectedCar.name}`);
    this.setState("playing");
  }

  // ---------- GAME LOGIC ----------
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

    // reset camera (keď sa vráti do menu)
    this.cameras.main.stopFollow();
    this.cameras.main.scrollX = 0;
    this.cameras.main.scrollY = 0;

    this.clearWorld();
  }

  update(_, delta){
    this.uiMoney.setText(`Peníze: ${this.money}`);

    if (this.state !== "playing") return;

    const gas  = this.touch.gas  || this.cursors.up.isDown;
    const left = this.touch.left || this.cursors.left.isDown;
    const right= this.touch.right|| this.cursors.right.isDown;

    if (left) this.car.body.setAngularVelocity(-160);
    else if (right) this.car.body.setAngularVelocity(160);
    else this.car.body.setAngularVelocity(0);

    if (gas){
      const angleDeg = (this.car.rotation * 180/Math.PI) - 90;
      const v = new Phaser.Math.Vector2();
      this.physics.velocityFromAngle(angleDeg, this.selectedCar.maxSpeed, v);

      // plynule pridávanie
      const a = clamp((this.selectedCar.accel || 520) / 800, 0.05, 0.18);
      this.car.body.velocity.x = Phaser.Math.Linear(this.car.body.velocity.x, v.x, a);
      this.car.body.velocity.y = Phaser.Math.Linear(this.car.body.velocity.y, v.y, a);
    }

    // červená zóna + červená = penalizácia
    const inRedZone = Phaser.Geom.Intersects.RectangleToRectangle(
      this.redZone.getBounds(),
      this.car.getBounds()
    );

    if (this.redLight && inRedZone && gas){
      this.penaltyTimer += delta;

      const step = 250;
      while (this.penaltyTimer >= step){
        this.penaltyTimer -= step;
        this.money = Math.max(0, this.money - 3);
      }
    }
  }

  // ---------- HELPERS ----------
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

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const finalScoreEl = document.getElementById("finalScore");
const startScreen = document.getElementById("startScreen");
const gameOver = document.getElementById("gameOver");

const W = canvas.width;
const H = canvas.height;
const TILE = 50;

let best = Number(localStorage.getItem("humanoBest") || 0);
bestEl.textContent = best;

const player = {
  // O jogador é o conjunto motociclista + moto elétrica.
  x: W / 2 - 28,
  y: H - TILE * 1.35,
  w: 56,
  h: 58,
  speed: 5,
  bob: 0
};

let score = 0;
let scoreProgress = 0;
let cameraY = 0;
let gameRunning = false;
let lastTime = 0;
let rows = [];
let particles = [];
let keys = {};
let highestRow = 0;

const colors = {
  grass: "#91c93c",
  grass2: "#a7dc45",
  road: "#454b55",
  roadDark: "#373d46",
  sidewalk: "#c6d05b",
  water: "#39a9c8"
};

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function makeRoad(row, y) {
  const direction = row % 2 === 0 ? 1 : -1;

  // Progressão controlada: a velocidade aumenta gradualmente, mas tem limite.
  const difficulty = Math.min(1 + row * 0.025, 2.0);
  const speed = rand(1.15, 1.75) * difficulty;

  const cars = [];
  const carCount = 3;
  const spacing = W / carCount;

  for (let i = 0; i < carCount; i++) {
    cars.push({
      x: i * spacing - 30,
      y: y + 11,
      w: 76,
      h: 30,
      speed: speed * direction,
      color: choice(["#e84c32", "#2da8d8", "#f0c33c", "#d65aa9", "#eeeeee"])
    });
  }

  return { type: "road", y, h: TILE * 1.5, cars, direction, rowIndex: row };
}

function makeGrass(row, y) {
  const trees = [];
  const count = 2 + Math.floor(Math.random() * 3);

  for (let i = 0; i < count; i++) {
    trees.push({
      x: rand(25, W - 55),
      y: y + rand(4, 26),
      w: rand(25, 38),
      h: rand(38, 54)
    });
  }

  return { type: "grass", y, h: TILE * 1.5, trees };
}

function makeWater(row, y) {
  const logs = [];
  const direction = row % 2 === 0 ? 1 : -1;
  const difficulty = Math.min(1 + row * 0.025, 2.0);

  // Três corredores fixos. Cada tronco tem espaço suficiente para não colidir
  // com outro tronco do mesmo corredor.
  const laneY = [12, 38, 64];
  const logWidth = 105;
  const spacing = 225;

  for (let lane = 0; lane < 3; lane++) {
    const laneSpeed = direction * (0.65 + lane * 0.08) * difficulty;

    for (let i = 0; i < 3; i++) {
      let x = i * spacing - 55;
      if (direction < 0) x = W - x - logWidth;

      logs.push({
        x,
        y: y + laneY[lane],
        w: logWidth,
        h: 20,
        speed: laneSpeed,
        lane
      });
    }
  }

  return {
    type: "water",
    y,
    h: TILE * 1.5,
    logs,
    direction,
    rowIndex: row
  };
}

let nextRowIndex = 0;

function createRows() {
  rows = [];
  nextRowIndex = 0;

  // A primeira faixa é 100% segura.
  addRow(nextRowIndex++, H - TILE * 1.5);

  // Gera o restante do mapa inicial usando índices fixos.
  for (let i = 1; i < 22; i++) {
    addRow(nextRowIndex++, H - TILE * 1.5 - i * TILE * 1.5);
  }
}

function addRow(index, y) {
  // Sequência determinística e independente da pontuação:
  // 0 = segura, 1 e 2 = estrada com veículos, 3 = lago.
  // Assim há estradas com obstáculos em intervalos regulares,
  // mesmo depois que faixas antigas são removidas.
  const pattern = ((index % 4) + 4) % 4;

  if (pattern === 0) {
    rows.push({
      type: "safe",
      y,
      h: TILE * 1.5,
      rowIndex: index,
      trees: []
    });
  } else if (pattern === 3) {
    rows.push(makeWater(index, y));
  } else {
    rows.push(makeRoad(index, y));
  }
}

function startGame() {
  score = 0;
  scoreProgress = 0;
  cameraY = 0;
  highestRow = 0;
  particles = [];
  player.x = W / 2 - player.w / 2;
  player.y = H - TILE * 1.35;
  createRows();
  gameRunning = true;
  startScreen.classList.add("hidden");
  gameOver.classList.add("hidden");
  scoreEl.textContent = "0";
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  gameRunning = false;
  finalScoreEl.textContent = score;
  if (score > best) {
    best = score;
    localStorage.setItem("humanoBest", best);
    bestEl.textContent = best;
  }
  gameOver.classList.remove("hidden");
}

function resetPlayer() {
  player.x = W / 2 - player.w / 2;
  player.y = H - TILE * 1.35;
}

// Mantém todos os elementos que nasceram dentro de uma faixa no mesmo
// sistema de coordenadas vertical da própria faixa. Isso é necessário
// porque a câmera desloca as faixas inteiras durante o avanço do jogador.
function shiftRow(row, delta) {
  row.y += delta;

  if (row.cars) {
    for (const car of row.cars) car.y += delta;
  }

  if (row.logs) {
    for (const log of row.logs) log.y += delta;
  }

  if (row.trees) {
    for (const tree of row.trees) tree.y += delta;
  }
}

function movePlayer(dx, dy) {
  if (!gameRunning) return;

  player.x += dx;
  player.y += dy;

  player.x = Math.max(5, Math.min(W - player.w - 5, player.x));

  if (player.y < H * 0.35) {
    const delta = H * 0.35 - player.y;
    player.y = H * 0.35;
    cameraY += delta;

    for (const row of rows) shiftRow(row, delta);

    // Pontua por distância efetivamente percorrida, sem acumular pontos
    // a cada frame de animação.
    scoreProgress += delta;
    const points = Math.floor(scoreProgress / (TILE * 1.5));
    if (points > 0) {
      score += points;
      scoreProgress -= points * (TILE * 1.5);
      scoreEl.textContent = score;
    }
  }

  if (player.y > H - player.h - 4) {
    player.y = H - player.h - 4;
  }
}

window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }

  keys[e.key.toLowerCase()] = true;

  if (!gameRunning && (e.key === "Enter" || e.key === " ")) {
    startGame();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", startGame);

function update(dt) {
  const move = player.speed * dt * 60 / 1000;

  if (keys["arrowup"] || keys["w"]) movePlayer(0, -move);
  if (keys["arrowdown"] || keys["s"]) movePlayer(0, move);
  if (keys["arrowleft"] || keys["a"]) movePlayer(-move, 0);
  if (keys["arrowright"] || keys["d"]) movePlayer(move, 0);

  player.bob += dt * 0.015;

  for (const row of rows) {
    if (row.type === "road") {
      for (const car of row.cars) {
        car.x += car.speed * dt / 16.67;

        if (car.speed > 0 && car.x > W + 100) car.x = -car.w - 80;
        if (car.speed < 0 && car.x < -car.w - 100) car.x = W + 80;

        if (hit(player, {
          x: car.x + 7,
          y: car.y + 5,
          w: car.w - 14,
          h: car.h - 8
        })) {
          burst(player.x + player.w / 2, player.y + player.h / 2);
          endGame();
          return;
        }
      }
    }

    if (row.type === "water") {
      let onLog = false;
      let carriedSpeed = 0;

      for (const log of row.logs) {
        log.x += log.speed * dt / 16.67;

        // Loop perfeito: os troncos reaparecem mantendo o espaçamento.
        if (log.speed > 0 && log.x > W + 20) {
          log.x = -log.w - 55;
        }

        if (log.speed < 0 && log.x < -log.w - 20) {
          log.x = W + 55;
        }

        const playerHitbox = {
          x: player.x + 6,
          y: player.y + 7,
          w: player.w - 12,
          h: player.h - 10
        };

        const logHitbox = {
          x: log.x + 2,
          y: log.y - 2,
          w: log.w - 4,
          h: log.h + 4
        };

        if (hit(playerHitbox, logHitbox)) {
          onLog = true;
          carriedSpeed = log.speed;
          break;
        }
      }

      // Só movimenta o personagem com o tronco em que ela realmente está.
      if (onLog) {
        player.x += carriedSpeed * dt / 16.67;

        // Se o tronco carregar o personagem para fora da tela, ela cai.
        if (player.x + player.w < 0 || player.x > W) {
          burst(Math.max(0, Math.min(W, player.x)), player.y + player.h / 2);
          endGame();
          return;
        }
      }

      const py = player.y + player.h / 2;
      if (py > row.y + 7 && py < row.y + row.h - 7 && !onLog) {
        burst(player.x + player.w / 2, player.y + player.h / 2);
        endGame();
        return;
      }
    }
  }

  player.x = Math.max(-player.w, Math.min(W, player.x));

  // Gera novas áreas usando um contador que nunca é reduzido.
  // Assim a sequência segura/estrada/lago continua correta para sempre.
  const rowHeight = TILE * 1.5;
  // Garante continuamente uma sequência de faixas à frente da câmera.
  // O índice global nunca é reiniciado quando faixas antigas são removidas.
  let topY = rows.length ? Math.min(...rows.map(r => r.y)) : H;
  while (topY > -rowHeight * 2) {
    topY -= rowHeight;
    addRow(nextRowIndex++, topY);
  }

  // Remove somente faixas que já ficaram muito atrás do jogador.
  rows = rows.filter(r => r.y < H + 180);
}

function hit(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function burst(x, y) {
  for (let i = 0; i < 18; i++) {
    particles.push({
      x, y,
      vx: rand(-4, 4),
      vy: rand(-5, 1),
      life: 1,
      char: choice(["✦", "★", "•"])
    });
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Fundo geral
  ctx.fillStyle = colors.grass;
  ctx.fillRect(0, 0, W, H);

  // Faixas
  for (const row of rows) {
    if (row.type === "safe") drawSafeZone(row);
    if (row.type === "grass") drawGrass(row);
    if (row.type === "road") drawRoad(row);
    if (row.type === "water") drawWater(row);
  }

  drawFinishLines();
  drawPlayer();

  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = "#ffe45c";
    ctx.font = "bold 22px monospace";
    ctx.fillText(p.char, p.x, p.y);
    ctx.globalAlpha = 1;
  }
}


function drawSafeZone(row) {
  // Espaço seguro: nenhum carro ou água entra nesta área.
  ctx.fillStyle = "#a9df45";
  ctx.fillRect(0, row.y, W, row.h);

  // Borda visual para mostrar que é uma área de descanso.
  ctx.fillStyle = "#d9f875";
  ctx.fillRect(0, row.y, W, 5);
  ctx.fillRect(0, row.y + row.h - 5, W, 5);

  // Pequenas marcações no chão.
  ctx.fillStyle = "rgba(255,255,255,.25)";
  for (let x = 18; x < W; x += 72) {
    ctx.fillRect(x, row.y + 18, 25, 4);
    ctx.fillRect(x + 28, row.y + 42, 18, 4);
  }

  // Placas indicando segurança.
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px monospace";
  ctx.fillText("ÁREA SEGURA", 16, row.y + 20);

  // Pequenas árvores decorativas nas laterais.
  drawSafeBush(28, row.y + 38);
  drawSafeBush(W - 50, row.y + 38);
}

function drawSafeBush(x, y) {
  ctx.fillStyle = "#5d8f24";
  ctx.fillRect(x, y + 8, 22, 12);
  ctx.fillStyle = "#8fc52d";
  ctx.fillRect(x - 4, y, 30, 14);
}

function drawGrass(row) {
  ctx.fillStyle = colors.grass;
  ctx.fillRect(0, row.y, W, row.h);

  ctx.fillStyle = colors.grass2;
  for (let x = 0; x < W; x += 42) {
    ctx.fillRect(x + 6, row.y + 9, 4, 4);
    ctx.fillRect(x + 25, row.y + 43, 5, 4);
  }

  for (const t of row.trees) {
    // sombra
    ctx.fillStyle = "rgba(20,50,15,.28)";
    ctx.fillRect(t.x + 4, t.y + t.h - 4, t.w + 5, 7);

    // tronco
    ctx.fillStyle = "#70452e";
    ctx.fillRect(t.x + t.w * .35, t.y + t.h - 10, t.w * .3, 15);

    // copa pixelada
    ctx.fillStyle = "#83aa20";
    ctx.fillRect(t.x, t.y + 8, t.w, t.h - 15);
    ctx.fillStyle = "#a9d82d";
    ctx.fillRect(t.x + 5, t.y, t.w - 10, 12);
    ctx.fillStyle = "#6f921d";
    ctx.fillRect(t.x + 4, t.y + 18, t.w - 8, 7);
  }
}

function drawRoad(row) {
  ctx.fillStyle = colors.road;
  ctx.fillRect(0, row.y, W, row.h);

  ctx.fillStyle = colors.roadDark;
  ctx.fillRect(0, row.y, W, 5);
  ctx.fillRect(0, row.y + row.h - 5, W, 5);

  // faixas
  ctx.fillStyle = "#aeb4bb";
  const offset = row.direction > 0 ? 0 : 25;
  for (let x = -80 + offset; x < W + 100; x += 110) {
    ctx.fillRect(x, row.y + row.h / 2 - 3, 48, 6);
  }

  for (const car of row.cars) drawCar(car);
}

function drawCar(car) {
  const x = Math.round(car.x);
  const y = Math.round(car.y);

  // sombra
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.fillRect(x + 5, y + 24, car.w - 10, 9);

  ctx.fillStyle = car.color;
  ctx.fillRect(x, y + 7, car.w, 19);
  ctx.fillRect(x + 10, y, car.w - 20, 13);

  ctx.fillStyle = "#eaf8ff";
  ctx.fillRect(x + 18, y + 3, car.w - 36, 9);

  ctx.fillStyle = "#15191d";
  ctx.fillRect(x + 8, y + 25, 13, 8);
  ctx.fillRect(x + car.w - 21, y + 25, 13, 8);

  ctx.fillStyle = "#4b5966";
  ctx.fillRect(x + 21, y + 5, 8, 7);
  ctx.fillRect(x + car.w - 29, y + 5, 8, 7);
}

function drawWater(row) {
  // Lago limpo, dividido em 3 corredores.
  ctx.fillStyle = "#238fb8";
  ctx.fillRect(0, row.y, W, row.h);

  // Correntes horizontais.
  for (let lane = 0; lane < 3; lane++) {
    const yy = row.y + 8 + lane * 26;

    ctx.fillStyle = "#45b9d4";
    for (let x = 0; x < W; x += 90) {
      ctx.fillRect(x + (lane * 20), yy, 34, 3);
    }

    ctx.fillStyle = "#1d789d";
    for (let x = 35; x < W; x += 105) {
      ctx.fillRect(x + (lane * 12), yy + 12, 27, 3);
    }
  }

  // Margens.
  ctx.fillStyle = "#a7d84a";
  ctx.fillRect(0, row.y, W, 7);
  ctx.fillRect(0, row.y + row.h - 7, W, 7);

  // Pedras pequenas.
  ctx.fillStyle = "#d3d98d";
  for (let x = 12; x < W; x += 48) {
    ctx.fillRect(x, row.y + 2, 9, 5);
    ctx.fillRect(x + 18, row.y + row.h - 7, 11, 5);
  }

  // Troncos alinhados.
  for (const log of row.logs) {
    const x = Math.round(log.x);
    const y = Math.round(log.y);

    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.fillRect(x + 4, y + 17, log.w - 8, 6);

    ctx.fillStyle = "#7a4a2a";
    ctx.fillRect(x, y, log.w, log.h);

    ctx.fillStyle = "#b8793f";
    ctx.fillRect(x + 6, y + 3, log.w - 12, 7);

    ctx.fillStyle = "#633b23";
    ctx.fillRect(x + 12, y + 14, log.w - 24, 3);

    // Pontas do tronco.
    ctx.fillStyle = "#d09a5c";
    ctx.fillRect(x + 2, y + 4, 10, 12);
    ctx.fillStyle = "#734524";
    ctx.fillRect(x + 5, y + 7, 4, 6);
  }
}

function drawFinishLines() {
  // pequeno indicador de progresso no topo
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.fillRect(15, 15, 160, 30);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 14px monospace";
  ctx.fillText("DISTÂNCIA: " + score, 25, 35);
}

function drawPlayer() {
  const x = Math.round(player.x);
  const y = Math.round(player.y + Math.sin(player.bob) * 1.5);

  // Sombra da moto
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(x + 5, y + 50, 46, 8);

  // --- MOTO ELÉTRICA ---
  // Rodas
  ctx.fillStyle = "#15191d";
  ctx.beginPath();
  ctx.arc(x + 11, y + 45, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 45, y + 45, 9, 0, Math.PI * 2);
  ctx.fill();

  // Aros
  ctx.fillStyle = "#b8c1ca";
  ctx.beginPath();
  ctx.arc(x + 11, y + 45, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 45, y + 45, 4, 0, Math.PI * 2);
  ctx.fill();

  // Chassi e carenagem
  ctx.fillStyle = "#202833";
  ctx.fillRect(x + 13, y + 34, 29, 8);
  ctx.fillStyle = "#19d3ae";
  ctx.fillRect(x + 17, y + 27, 21, 10);
  ctx.fillRect(x + 25, y + 22, 13, 7);

  // Bateria elétrica
  ctx.fillStyle = "#11161c";
  ctx.fillRect(x + 20, y + 34, 17, 7);
  ctx.fillStyle = "#53f0c9";
  ctx.fillRect(x + 23, y + 36, 11, 3);

  // Guidão e farol
  ctx.strokeStyle = "#d5dbe0";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 37, y + 25);
  ctx.lineTo(x + 45, y + 17);
  ctx.lineTo(x + 51, y + 18);
  ctx.stroke();
  ctx.fillStyle = "#fff4a3";
  ctx.fillRect(x + 46, y + 20, 6, 5);

  // Banco
  ctx.fillStyle = "#15191d";
  ctx.fillRect(x + 16, y + 21, 17, 5);

  // --- HUMANO PILOTANDO ---
  // Pernas dobradas
  ctx.strokeStyle = "#24466d";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x + 27, y + 24);
  ctx.lineTo(x + 34, y + 34);
  ctx.lineTo(x + 39, y + 35);
  ctx.stroke();

  // Tênis
  ctx.fillStyle = "#f1f1f1";
  ctx.fillRect(x + 37, y + 32, 9, 5);

  // Tronco/camiseta
  ctx.fillStyle = "#e74c3c";
  ctx.fillRect(x + 18, y + 8, 18, 17);

  // Braços segurando o guidão
  ctx.strokeStyle = "#d99a72";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 12);
  ctx.lineTo(x + 31, y + 20);
  ctx.lineTo(x + 42, y + 18);
  ctx.stroke();

  // Pescoço
  ctx.fillStyle = "#d99a72";
  ctx.fillRect(x + 23, y + 3, 8, 8);

  // Cabeça
  ctx.fillStyle = "#e3a477";
  ctx.fillRect(x + 18, y - 9, 20, 18);
  ctx.fillRect(x + 21, y - 12, 14, 4);

  // Cabelo
  ctx.fillStyle = "#3a271c";
  ctx.fillRect(x + 18, y - 12, 20, 7);
  ctx.fillRect(x + 18, y - 8, 4, 8);

  // Olhos
  ctx.fillStyle = "#111";
  ctx.fillRect(x + 24, y - 4, 2, 2);
  ctx.fillRect(x + 31, y - 4, 2, 2);

  // Capacete
  ctx.fillStyle = "#263b68";
  ctx.fillRect(x + 16, y - 13, 24, 5);
  ctx.fillRect(x + 18, y - 16, 20, 5);
  ctx.fillStyle = "#9ee7ff";
  ctx.fillRect(x + 31, y - 9, 9, 4);

  // Pequenos detalhes elétricos
  ctx.fillStyle = "#53f0c9";
  ctx.fillRect(x + 40, y + 31, 4, 3);
}
function loop(time) {
  if (!gameRunning) return;
  const dt = Math.min(40, time - lastTime || 16);
  lastTime = time;

  update(dt);

  // partículas
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.18;
    p.life -= 0.025;
  });
  particles = particles.filter(p => p.life > 0);

  draw();
  requestAnimationFrame(loop);
}

createRows();
draw();

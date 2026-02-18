// ═══════════════════════════════════════════════════════════════════
//  NEON BUBBLES — Juicy Retro Bubble Shooter (complete rewrite)
// ═══════════════════════════════════════════════════════════════════

// ── Constants ───────────────────────────────────────────────────
const GAME_W = 480;
const GAME_H = 700;
const COLS = 13;
const ROWS = 14;                          // max rows before game-over
const BUBBLE_R = 18;                      // bubble radius
const BUBBLE_D = BUBBLE_R * 2;            // diameter = grid cell width
const ROW_H = BUBBLE_R * 1.732;           // √3 ≈ vertical hex spacing
const GRID_LEFT = (GAME_W - COLS * BUBBLE_D) / 2; // center grid horizontally
const GRID_TOP = 60;                      // y-offset for row 0
const SHOOT_Y = GAME_H - 60;             // cannon y
const SHOOT_SPEED = 720;                  // px/s
const COLORS = [0xff0055, 0x00ff88, 0x00ccff, 0xffee00, 0xff7700, 0xcc44ff];
const COLOR_NAMES = ["red", "green", "cyan", "yellow", "orange", "purple"];
const WALL_L = BUBBLE_R;
const WALL_R = GAME_W - BUBBLE_R;
const DESCENT_INTERVAL = 12000;           // ms between row pushes
const BOMB_CHANCE = 0.06;                 // chance a new bubble is a bomb

// ── Helpers ─────────────────────────────────────────────────────
function gridToPixel(row, col) {
    const x = GRID_LEFT + col * BUBBLE_D + BUBBLE_R + ((row % 2 === 1) ? BUBBLE_R : 0);
    const y = row * ROW_H + GRID_TOP;
    return { x, y };
}

function pixelToGrid(px, py) {
    // Convert pixel to nearest grid cell
    let row = Math.round((py - GRID_TOP) / ROW_H);
    row = Math.max(0, Math.min(row, ROWS - 1));
    const oddOffset = (row % 2 === 1) ? BUBBLE_R : 0;
    let col = Math.round((px - GRID_LEFT - BUBBLE_R - oddOffset) / BUBBLE_D);
    const maxCol = (row % 2 === 1) ? COLS - 2 : COLS - 1;
    col = Math.max(0, Math.min(col, maxCol));
    return { row, col };
}

function neighborOffsets(row) {
    if (row % 2 === 0) {
        return [[-1, -1], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 0]];
    }
    return [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0], [1, 1]];
}

function validCell(r, c) {
    if (r < 0 || r >= ROWS) return false;
    const maxC = (r % 2 === 1) ? COLS - 2 : COLS - 1;
    return c >= 0 && c <= maxC;
}

// ═══════════════════════════════════════════════════════════════════
//  Chromatic Aberration Pipeline (WebGL)
// ═══════════════════════════════════════════════════════════════════
const CHROMA_FRAG = `
precision mediump float;
uniform sampler2D uMainSampler;
uniform float uOffset;
varying vec2 outTexCoord;
void main() {
    float o = uOffset;
    vec4 cr = texture2D(uMainSampler, vec2(outTexCoord.x + o, outTexCoord.y));
    vec4 cg = texture2D(uMainSampler, outTexCoord);
    vec4 cb = texture2D(uMainSampler, vec2(outTexCoord.x - o, outTexCoord.y));
    gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
}
`;

class ChromaticPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
    constructor(game) {
        super({ game, fragShader: CHROMA_FRAG });
        this._offset = 0;
    }
    onPreRender() {
        if (this._offset < 0.0005) { this._offset = 0; this.set1f("uOffset", 0); return; }
        this.set1f("uOffset", this._offset);
        this._offset *= 0.92;
    }
    setIntensity(v) { this._offset = v; }
}

// ═══════════════════════════════════════════════════════════════════
//  PERFORMANCE TIER — detect low-end devices once at startup
// ═══════════════════════════════════════════════════════════════════
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
const PERF_LOW = IS_MOBILE || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
const PARTICLE_COUNT = PERF_LOW ? 4 : 12;
const TWEEN_DURATION_MULT = PERF_LOW ? 0.6 : 1;

// ═══════════════════════════════════════════════════════════════════
//  MAIN MENU SCENE
// ═══════════════════════════════════════════════════════════════════
class MainMenu extends Phaser.Scene {
    constructor() { super({ key: "MainMenu" }); }

    create() {
        this.cameras.main.setBackgroundColor(0x0a0a12);

        // floating decorative bubbles (fewer on low-end)
        const bubCount = PERF_LOW ? 12 : 40;
        for (let i = 0; i < bubCount; i++) {
            const c = Phaser.Math.RND.pick(COLORS);
            const r = Phaser.Math.Between(4, 14);
            const bub = this.add.circle(
                Phaser.Math.Between(0, GAME_W),
                Phaser.Math.Between(0, GAME_H),
                r, c, 0.25
            );
            this.tweens.add({
                targets: bub, y: bub.y - Phaser.Math.Between(60, 200),
                alpha: 0, duration: Phaser.Math.Between(2000, 5000),
                repeat: -1, yoyo: true, ease: "Sine.easeInOut",
                delay: Phaser.Math.Between(0, 3000)
            });
        }

        // title
        const title = this.add.text(GAME_W / 2, 180, "NEON\nBUBBLES", {
            fontFamily: "monospace", fontSize: "56px", fontStyle: "bold",
            color: "#00ffcc", align: "center", lineSpacing: 8,
            stroke: "#005544", strokeThickness: 4
        }).setOrigin(0.5);
        this.tweens.add({
            targets: title, scaleX: 1.04, scaleY: 0.96,
            duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
        });

        // instructions — detect mobile
        const isMob = !this.sys.game.device.os.desktop;
        const instrText = isMob
            ? "HOLD  to aim\nRELEASE  to shoot\nMATCH  3+ to clear"
            : "AIM  with mouse\nSHOOT  click or SPACE\nMATCH  3+ to clear";
        this.add.text(GAME_W / 2, 340, instrText, {
            fontFamily: "monospace", fontSize: "15px", color: "#667788",
            align: "center", lineSpacing: 6
        }).setOrigin(0.5);

        // start button
        const btn = this.add.text(GAME_W / 2, 460, "[ START ]", {
            fontFamily: "monospace", fontSize: "28px", fontStyle: "bold",
            color: "#ffee00", stroke: "#554400", strokeThickness: 3
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.tweens.add({
            targets: btn, alpha: 0.5,
            duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
        });

        btn.on("pointerover", () => btn.setColor("#ffffff"));
        btn.on("pointerout", () => btn.setColor("#ffee00"));

        const startGame = () => {
            try { initAudio(); startMusic(); } catch (e) { /* audio optional */ }
            this.cameras.main.fade(300, 0, 0, 0);
            this.time.delayedCall(300, () => this.scene.start("GameScene"));
        };

        btn.on("pointerdown", startGame);
        this.input.keyboard.on("keydown-SPACE", startGame);
    }
}

// ═══════════════════════════════════════════════════════════════════
//  GAME SCENE
// ═══════════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
    constructor() { super({ key: "GameScene" }); }

    // ── Preload ─────────────────────────────────────────────────
    preload() {
        // Generate circle textures procedurally
        COLORS.forEach((c, i) => {
            const gfx = this.make.graphics({ add: false });
            // outer glow
            gfx.fillStyle(c, 0.25);
            gfx.fillCircle(BUBBLE_R + 4, BUBBLE_R + 4, BUBBLE_R + 4);
            // main fill
            gfx.fillStyle(c, 1);
            gfx.fillCircle(BUBBLE_R + 4, BUBBLE_R + 4, BUBBLE_R - 1);
            // highlight
            gfx.fillStyle(0xffffff, 0.35);
            gfx.fillCircle(BUBBLE_R, BUBBLE_R, BUBBLE_R * 0.35);
            gfx.generateTexture("bub_" + i, (BUBBLE_R + 4) * 2, (BUBBLE_R + 4) * 2);
            gfx.destroy();
        });

        // Bomb texture
        const bg = this.make.graphics({ add: false });
        bg.fillStyle(0xffffff, 0.3);
        bg.fillCircle(BUBBLE_R + 4, BUBBLE_R + 4, BUBBLE_R + 4);
        bg.fillStyle(0xffffff, 1);
        bg.fillCircle(BUBBLE_R + 4, BUBBLE_R + 4, BUBBLE_R - 1);
        bg.fillStyle(0xff0000, 1);
        bg.fillCircle(BUBBLE_R + 4, BUBBLE_R + 4, BUBBLE_R * 0.45);
        bg.generateTexture("bub_bomb", (BUBBLE_R + 4) * 2, (BUBBLE_R + 4) * 2);
        bg.destroy();

        // Tiny square particle
        const pg = this.make.graphics({ add: false });
        pg.fillStyle(0xffffff, 1);
        pg.fillRect(0, 0, 6, 6);
        pg.generateTexture("particle", 6, 6);
        pg.destroy();
    }

    // ── Create ──────────────────────────────────────────────────
    create() {
        this.cameras.main.setBackgroundColor(0x0a0a12);
        this.cameras.main.fadeIn(400);

        // Chromatic aberration
        this.chromaPipeline = null;
        if (this.renderer && this.renderer.pipelines) {
            try {
                this.chromaPipeline = this.cameras.main.setPostPipeline(ChromaticPipeline);
            } catch (e) { /* WebGL not available, skip */ }
        }

        // ── State ───────────────────────────────────────────────
        this.grid = [];                     // grid[row][col] = sprite | null
        for (let r = 0; r < ROWS; r++) this.grid[r] = [];

        this.score = 0;
        this.combo = 0;                     // consecutive clears
        this.shotsWithoutClear = 0;
        this.level = 1;
        this.projectile = null;
        this.isShooting = false;
        this.gameOver = false;
        this.nextColorIdx = this.pickColor();
        this.descentTimer = 0;

        // ── Groups ──────────────────────────────────────────────
        this.bubbleGroup = this.add.group();
        this.particleGroup = this.add.group();

        // ── UI ──────────────────────────────────────────────────
        this.scoreText = this.add.text(10, 8, "SCORE: 0", {
            fontFamily: "monospace", fontSize: "16px", fontStyle: "bold",
            color: "#00ffcc"
        });
        this.comboText = this.add.text(GAME_W / 2, 8, "", {
            fontFamily: "monospace", fontSize: "16px", fontStyle: "bold",
            color: "#ffee00"
        }).setOrigin(0.5, 0);
        this.levelText = this.add.text(GAME_W - 10, 8, "LVL 1", {
            fontFamily: "monospace", fontSize: "16px", fontStyle: "bold",
            color: "#ff7700"
        }).setOrigin(1, 0);

        // danger line
        this.dangerLine = this.add.rectangle(GAME_W / 2, SHOOT_Y - 40, GAME_W, 2, 0xff0000, 0.3);

        // ── Aim line ────────────────────────────────────────────
        this.aimGraphics = this.add.graphics();

        // ── Next bubble preview ─────────────────────────────────
        this.add.text(60, GAME_H - 30, "NEXT", {
            fontFamily: "monospace", fontSize: "10px", color: "#555"
        }).setOrigin(0.5);
        this.nextPreview = this.add.image(60, GAME_H - 14, "bub_" + this.nextColorIdx)
            .setScale(0.6);

        // ── Mobile detection ────────────────────────────────────
        this.isMobile = !this.sys.game.device.os.desktop;

        // ── Input ───────────────────────────────────────────────
        if (this.isMobile) {
            // Mobile: hold to aim, release to shoot
            this.input.on("pointerup", (ptr) => {
                if (this.mobileAiming) {
                    this.mobileAiming = false;
                    this.shootAt(ptr.x, ptr.y);
                }
            });
            this.input.on("pointerdown", () => {
                if (!this.isShooting && !this.gameOver && !this.isPaused) {
                    this.mobileAiming = true;
                }
            });
            this.mobileAiming = false;
        } else {
            // Desktop: click to shoot
            this.input.on("pointerdown", (ptr) => this.shootAt(ptr.x, ptr.y));
        }
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.spaceJustPressed = false;

        // ── Custom cursor (desktop) ─────────────────────────────
        if (!this.isMobile) {
            this.input.setDefaultCursor("crosshair");
        }

        // ── Pause ───────────────────────────────────────────────
        this.isPaused = false;
        this.input.keyboard.on("keydown-P", () => this.togglePause());
        this.input.keyboard.on("keydown-ESC", () => this.togglePause());

        // Pause overlay (hidden by default)
        this.pauseOverlay = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.7)
            .setDepth(900).setVisible(false);
        this.pauseTitle = this.add.text(GAME_W / 2, GAME_H / 2 - 60, "PAUSED", {
            fontFamily: "monospace", fontSize: "48px", color: "#ffffff",
            stroke: "#00ccff", strokeThickness: 4
        }).setOrigin(0.5).setDepth(901).setVisible(false);
        this.pauseHint = this.add.text(GAME_W / 2, GAME_H / 2 + 10, "P or ESC to resume", {
            fontFamily: "monospace", fontSize: "16px", color: "#aaaaaa"
        }).setOrigin(0.5).setDepth(901).setVisible(false);
        this.pauseRestart = this.add.text(GAME_W / 2, GAME_H / 2 + 50, "[ R ] Restart", {
            fontFamily: "monospace", fontSize: "16px", color: "#ff5555"
        }).setOrigin(0.5).setDepth(901).setVisible(false)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
                this.isPaused = false;
                try { if (typeof stopMusic === "function") stopMusic(); } catch (e) {}
                this.scene.restart();
            });
        this.pauseMenu = this.add.text(GAME_W / 2, GAME_H / 2 + 85, "[ M ] Main Menu", {
            fontFamily: "monospace", fontSize: "16px", color: "#ffcc00"
        }).setOrigin(0.5).setDepth(901).setVisible(false)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
                this.isPaused = false;
                try { if (typeof stopMusic === "function") stopMusic(); } catch (e) {}
                this.scene.start("MainMenu");
            });

        // R and M keys for pause menu shortcuts
        this.input.keyboard.on("keydown-R", () => {
            if (this.isPaused) {
                this.isPaused = false;
                try { if (typeof stopMusic === "function") stopMusic(); } catch (e) {}
                this.scene.restart();
            }
        });
        this.input.keyboard.on("keydown-M", () => {
            if (this.isPaused) {
                this.isPaused = false;
                try { if (typeof stopMusic === "function") stopMusic(); } catch (e) {}
                this.scene.start("MainMenu");
            }
        });

        // ── Init grid with clustered, fun patterns ──────────────
        const startRows = Math.min(4 + Math.floor(this.level / 3), 6);
        this.generateClusteredGrid(startRows);

        // ── Create first projectile ─────────────────────────────
        this.spawnProjectile();
    }

    // ── Update ──────────────────────────────────────────────────
    update(time, delta) {
        if (this.gameOver) return;
        if (this.isPaused) return;

        // Space bar
        if (this.spaceKey.isDown && !this.spaceJustPressed) {
            this.spaceJustPressed = true;
            const ptr = this.input.activePointer;
            this.shootAt(ptr.x, ptr.y);
        }
        if (this.spaceKey.isUp) this.spaceJustPressed = false;

        // Descent timer — rows push down periodically
        this.descentTimer += delta;
        const interval = Math.max(5000, DESCENT_INTERVAL - this.level * 500);
        if (this.descentTimer >= interval) {
            this.descentTimer = 0;
            this.pushRowDown();
        }

        // ── Projectile in flight ────────────────────────────────
        if (this.isShooting && this.projectile) {
            const p = this.projectile;
            const dt = delta / 1000;

            p.x += p.getData("vx") * dt;
            p.y += p.getData("vy") * dt;

            // Wall bounce
            if (p.x < WALL_L) {
                p.x = WALL_L + (WALL_L - p.x);
                p.setData("vx", Math.abs(p.getData("vx")));
                this.squash(p, 0.7, 1.3, 80);
            }
            if (p.x > WALL_R) {
                p.x = WALL_R - (p.x - WALL_R);
                p.setData("vx", -Math.abs(p.getData("vx")));
                this.squash(p, 0.7, 1.3, 80);
            }

            // Ceiling hit
            if (p.y <= GRID_TOP) {
                p.y = GRID_TOP;
                this.snapAndProcess(p);
                return;
            }

            // Collision with grid bubbles (only check nearby rows)
            const approxR = Math.round((p.y - GRID_TOP) / ROW_H);
            const rLo = Math.max(0, approxR - 1);
            const rHi = Math.min(ROWS - 1, approxR + 1);
            const collDistSq = BUBBLE_D * 0.9 * BUBBLE_D * 0.9;
            for (let r = rLo; r <= rHi; r++) {
                for (let c = 0; c < this.grid[r].length; c++) {
                    const b = this.grid[r][c];
                    if (!b) continue;
                    const ddx = p.x - b.x; const ddy = p.y - b.y;
                    if (ddx * ddx + ddy * ddy < collDistSq) {
                        this.snapAndProcess(p);
                        return;
                    }
                }
            }

            // Fell off bottom (safety)
            if (p.y > GAME_H + 50) {
                p.destroy();
                this.isShooting = false;
                this.projectile = null;
                this.spawnProjectile();
            }
        }

        // ── Aim line with bounce prediction (throttled) ────────
        if (!this.isShooting && this.projectile) {
            const ptr = this.input.activePointer;
            const showAim = this.isMobile ? ptr.isDown : true;
            if (!showAim) {
                this.aimGraphics.clear();
            } else {
                // Throttle: only redraw if pointer moved > 2px
                const lastPx = this._lastAimX || 0;
                const lastPy = this._lastAimY || 0;
                const dx = ptr.x - lastPx;
                const dy = ptr.y - lastPy;
                if (dx * dx + dy * dy > 4) {
                    this._lastAimX = ptr.x;
                    this._lastAimY = ptr.y;
                    this.aimGraphics.clear();
                    const px = this.projectile.x;
                    const py = this.projectile.y;
                    let angle = Math.atan2(ptr.y - py, ptr.x - px);
                    angle = Phaser.Math.Clamp(angle, -Math.PI + 0.15, -0.15);
                    const points = this.computeTrajectory(px, py, angle);
                    if (points.length >= 2) {
                        // Solid line
                        this.aimGraphics.lineStyle(2, 0xffffff, 0.5);
                        this.aimGraphics.beginPath();
                        this.aimGraphics.moveTo(points[0].x, points[0].y);
                        for (let i = 1; i < points.length; i++) {
                            this.aimGraphics.lineTo(points[i].x, points[i].y);
                        }
                        this.aimGraphics.strokePath();
                        // Dots (fewer on mobile)
                        const dotSpacing = IS_MOBILE ? 40 : 24;
                        let accumulated = 0;
                        for (let i = 1; i < points.length; i++) {
                            const sx = points[i].x - points[i - 1].x;
                            const sy = points[i].y - points[i - 1].y;
                            const segLen = Math.sqrt(sx * sx + sy * sy);
                            const numDots = Math.floor(segLen / dotSpacing);
                            for (let d = 1; d <= numDots; d++) {
                                const t = d / (numDots + 1);
                                const ddx = points[i - 1].x + sx * t;
                                const ddy = points[i - 1].y + sy * t;
                                const alpha = 0.4 - (accumulated + segLen * t) * 0.0004;
                                if (alpha > 0.05) {
                                    this.aimGraphics.fillStyle(0xffffff, alpha);
                                    this.aimGraphics.fillCircle(ddx, ddy, 2.5);
                                }
                            }
                            accumulated += segLen;
                        }
                        // Crosshair at endpoint
                        const end = points[points.length - 1];
                        this.aimGraphics.lineStyle(1.5, 0xffffff, 0.6);
                        this.aimGraphics.strokeCircle(end.x, end.y, BUBBLE_R);
                        this.aimGraphics.lineStyle(1, 0xffffff, 0.3);
                        this.aimGraphics.strokeCircle(end.x, end.y, BUBBLE_R * 0.4);
                        this.aimGraphics.lineStyle(1, 0xffffff, 0.6);
                        this.aimGraphics.beginPath();
                        this.aimGraphics.moveTo(end.x - 5, end.y);
                        this.aimGraphics.lineTo(end.x + 5, end.y);
                        this.aimGraphics.moveTo(end.x, end.y - 5);
                        this.aimGraphics.lineTo(end.x, end.y + 5);
                        this.aimGraphics.strokePath();
                    }
                }
            }
        } else {
            this.aimGraphics.clear();
        }
    }

    // ── Trajectory prediction with wall bounces (optimized) ───
    computeTrajectory(startX, startY, angle) {
        const points = [{ x: startX, y: startY }];
        let cx = startX;
        let cy = startY;
        let vx = Math.cos(angle);
        let vy = Math.sin(angle);
        const step = IS_MOBILE ? 8 : 4;
        const maxSteps = IS_MOBILE ? 200 : 600;
        const collDist = BUBBLE_D * 0.9;
        const collDistSq = collDist * collDist;

        for (let i = 0; i < maxSteps; i++) {
            cx += vx * step;
            cy += vy * step;

            // Wall bounce
            if (cx < WALL_L) {
                cx = WALL_L + (WALL_L - cx);
                vx = Math.abs(vx);
                points.push({ x: WALL_L, y: cy });
            } else if (cx > WALL_R) {
                cx = WALL_R - (cx - WALL_R);
                vx = -Math.abs(vx);
                points.push({ x: WALL_R, y: cy });
            }

            // Hit ceiling
            if (cy <= GRID_TOP) {
                points.push({ x: cx, y: GRID_TOP });
                break;
            }

            // Hit a bubble — only check nearby rows (not entire grid)
            const approxRow = Math.round((cy - GRID_TOP) / ROW_H);
            const rMin = Math.max(0, approxRow - 1);
            const rMax = Math.min(ROWS - 1, approxRow + 1);
            let hitBubble = false;
            for (let r = rMin; r <= rMax; r++) {
                if (!this.grid[r]) continue;
                for (let c = 0; c < COLS; c++) {
                    const bub = this.grid[r][c];
                    if (!bub) continue;
                    const ddx = cx - bub.x;
                    const ddy = cy - bub.y;
                    if (ddx * ddx + ddy * ddy < collDistSq) {
                        points.push({ x: cx, y: cy });
                        hitBubble = true;
                        break;
                    }
                }
                if (hitBubble) break;
            }
            if (hitBubble) break;
        }

        // If we ran out of steps, add the final position
        if (points.length === 1 || (points[points.length - 1].x !== cx && points[points.length - 1].y !== cy)) {
            // Only add if the last point isn't already the current position
        }

        return points;
    }

    // ── Pause ────────────────────────────────────────────────────
    togglePause() {
        if (this.gameOver) return;
        this.isPaused = !this.isPaused;
        const show = this.isPaused;
        this.pauseOverlay.setVisible(show);
        this.pauseTitle.setVisible(show);
        this.pauseHint.setVisible(show);
        this.pauseRestart.setVisible(show);
        this.pauseMenu.setVisible(show);

        if (show) {
            // Dim the game and pulse the title
            this.tweens.add({
                targets: this.pauseTitle,
                scaleX: 1.05, scaleY: 1.05,
                yoyo: true, repeat: -1, duration: 800,
                ease: "Sine.easeInOut"
            });
        } else {
            // Stop pulse
            this.tweens.killTweensOf(this.pauseTitle);
            this.pauseTitle.setScale(1);
        }
    }

    // ── Shoot ───────────────────────────────────────────────────
    shootAt(tx, ty) {
        if (!this.projectile || this.isShooting || this.gameOver || this.isPaused) return;

        const p = this.projectile;
        // Must aim upward
        if (ty >= p.y - 10) return;

        let angle = Math.atan2(ty - p.y, tx - p.x);
        angle = Phaser.Math.Clamp(angle, -Math.PI + 0.15, -0.15);

        p.setData("vx", Math.cos(angle) * SHOOT_SPEED);
        p.setData("vy", Math.sin(angle) * SHOOT_SPEED);
        this.isShooting = true;

        // Juice: squash on launch
        this.squash(p, 0.6, 1.4, 120);
        this.shakeCamera(0.003, 60);

        try { playShoot(); } catch (e) {}
    }

    // ── Snap & Process ──────────────────────────────────────────
    snapAndProcess(proj) {
        const ci = proj.getData("colorIdx");
        const isBomb = proj.getData("isBomb");

        // Find closest empty cell to the projectile position
        const target = this.findBestCell(proj.x, proj.y);

        // Remove the flying projectile
        proj.destroy();
        this.isShooting = false;
        this.projectile = null;

        if (!target) {
            // No valid cell found (shouldn't happen)
            this.spawnProjectile();
            return;
        }

        const { row, col } = target;

        // Place bubble
        const placed = this.placeBubble(row, col, ci, isBomb);
        if (!placed) {
            this.spawnProjectile();
            return;
        }

        // Impact juice
        const pos = gridToPixel(row, col);
        this.squash(this.grid[row][col], 1.3, 0.7, 100);
        this.shakeCamera(0.005, 80);
        this.chromaFlash(0.003);
        try { playImpact(); } catch (e) {}

        // Wobble neighbors
        const nbrs = neighborOffsets(row);
        nbrs.forEach(([dr, dc]) => {
            const nr = row + dr, nc = col + dc;
            if (validCell(nr, nc) && this.grid[nr] && this.grid[nr][nc]) {
                this.squash(this.grid[nr][nc], 1.15, 0.85, 120);
            }
        });

        // ── Bomb logic ──────────────────────────────────────────
        if (isBomb) {
            this.detonateBomb(row, col);
            this.spawnProjectile();
            return;
        }

        // ── Match detection (flood fill) ────────────────────────
        const matches = this.floodFill(row, col, ci);

        if (matches.length >= 3) {
            this.combo++;
            this.clearMatches(matches);

            // Drop floating clusters
            const dropped = this.dropFloating();

            // Score
            const basePoints = matches.length * 100;
            const dropPoints = dropped * 200;
            const comboMult = Math.min(this.combo, 8);
            const total = (basePoints + dropPoints) * comboMult;
            this.addScore(total);
            this.shotsWithoutClear = 0;

            // Level up every 2000 points
            const newLevel = 1 + Math.floor(this.score / 2000);
            if (newLevel > this.level) {
                this.level = newLevel;
                this.levelText.setText("LVL " + this.level);
                this.tweens.add({
                    targets: this.levelText, scaleX: 1.5, scaleY: 1.5,
                    duration: 200, yoyo: true, ease: "Back.easeOut"
                });
                try { playLevelUp(); } catch (e) {}
                this.shakeCamera(0.015, 300);
                this.chromaFlash(0.01);
            }
        } else {
            this.combo = 0;
            this.shotsWithoutClear++;
        }

        // Update combo display
        if (this.combo > 1) {
            this.comboText.setText("COMBO x" + this.combo);
            this.tweens.add({
                targets: this.comboText, scaleX: 1.4, scaleY: 1.4,
                duration: 150, yoyo: true, ease: "Back.easeOut"
            });
        } else {
            this.comboText.setText("");
        }

        // Check game over
        if (this.checkGameOver()) {
            this.triggerGameOver();
            return;
        }

        this.spawnProjectile();
    }

    // ── Find best empty cell near a pixel position ──────────────
    findBestCell(px, py) {
        let bestDist = Infinity;
        let bestR = -1, bestC = -1;

        // Check a wide region around the projectile
        const approx = pixelToGrid(px, py);
        const searchR = 3;
        for (let dr = -searchR; dr <= searchR; dr++) {
            for (let dc = -searchR; dc <= searchR; dc++) {
                const r = approx.row + dr;
                const c = approx.col + dc;
                if (!validCell(r, c)) continue;
                if (this.grid[r] && this.grid[r][c]) continue; // occupied
                const pos = gridToPixel(r, c);
                const dist = Phaser.Math.Distance.Between(px, py, pos.x, pos.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestR = r;
                    bestC = c;
                }
            }
        }

        if (bestR === -1) return null;
        return { row: bestR, col: bestC };
    }

    // ── Place a bubble in the grid ──────────────────────────────
    placeBubble(row, col, colorIdx, isBomb = false) {
        if (!validCell(row, col)) return false;
        if (this.grid[row][col]) return false;  // occupied

        const pos = gridToPixel(row, col);
        const texKey = isBomb ? "bub_bomb" : ("bub_" + colorIdx);
        const bub = this.add.image(pos.x, pos.y, texKey).setData({
            row, col, colorIdx, isBomb
        });
        this.grid[row][col] = bub;
        this.bubbleGroup.add(bub);
        return true;
    }

    // ── Flood fill for matching ─────────────────────────────────
    floodFill(startR, startC, colorIdx) {
        const visited = new Set();
        const result = [];
        const stack = [{ r: startR, c: startC }];
        visited.add(`${startR},${startC}`);

        while (stack.length > 0) {
            const { r, c } = stack.pop();
            const bub = this.grid[r] ? this.grid[r][c] : null;
            if (!bub) continue;
            if (bub.getData("isBomb")) continue;
            if (bub.getData("colorIdx") !== colorIdx) continue;

            result.push({ r, c, bub });

            neighborOffsets(r).forEach(([dr, dc]) => {
                const nr = r + dr, nc = c + dc;
                const key = `${nr},${nc}`;
                if (validCell(nr, nc) && !visited.has(key)) {
                    visited.add(key);
                    stack.push({ r: nr, c: nc });
                }
            });
        }
        return result;
    }

    // ── Clear matched bubbles with juice ────────────────────────
    clearMatches(matches) {
        const dur = 150;
        matches.forEach((m, i) => {
            const { r, c, bub } = m;
            this.grid[r][c] = null;

            // Staggered explosion
            this.time.delayedCall(i * 30, () => {
                this.burstParticles(bub.x, bub.y, COLORS[bub.getData("colorIdx")], 12);
                this.squash(bub, 1.5, 1.5, 80);
                this.tweens.add({
                    targets: bub, alpha: 0, scaleX: 0, scaleY: 0,
                    duration: dur, ease: "Back.easeIn",
                    onComplete: () => bub.destroy()
                });
            });
        });

        // Heavy juice
        const intensity = 0.005 + matches.length * 0.003;
        this.shakeCamera(intensity, 200 + matches.length * 30);
        this.chromaFlash(0.005 + matches.length * 0.002);

        try { playClear(matches.length); } catch (e) {}
        if (this.combo > 1) {
            try { playCombo(this.combo); } catch (e) {}
        }
    }

    // ── Bomb detonation ─────────────────────────────────────────
    detonateBomb(row, col) {
        const radius = 2;
        const destroyed = [];

        for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
                const nr = row + dr, nc = col + dc;
                if (!validCell(nr, nc)) continue;
                const bub = this.grid[nr] ? this.grid[nr][nc] : null;
                if (!bub) continue;
                destroyed.push({ r: nr, c: nc, bub });
                this.grid[nr][nc] = null;
            }
        }

        // Destroy with big explosion
        const center = gridToPixel(row, col);
        destroyed.forEach((m, i) => {
            this.time.delayedCall(i * 15, () => {
                this.burstParticles(m.bub.x, m.bub.y, 0xffffff, 16);
                this.tweens.add({
                    targets: m.bub, alpha: 0, scaleX: 2, scaleY: 2,
                    duration: 200, ease: "Expo.easeOut",
                    onComplete: () => m.bub.destroy()
                });
            });
        });

        // Screen-clearing flash
        const flash = this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0xffffff, 0.6);
        this.tweens.add({
            targets: flash, alpha: 0, duration: 400,
            onComplete: () => flash.destroy()
        });

        this.shakeCamera(0.025, 500);
        this.chromaFlash(0.02);
        this.addScore(destroyed.length * 300);
        this.dropFloating();

        try { playBomb(); } catch (e) {}
    }

    // ── Drop floating clusters ──────────────────────────────────
    dropFloating() {
        // BFS from top row to find grounded bubbles
        const grounded = new Set();
        const visited = new Set();
        const queue = [];

        for (let c = 0; c < COLS; c++) {
            if (this.grid[0] && this.grid[0][c]) {
                const key = `0,${c}`;
                visited.add(key);
                grounded.add(key);
                queue.push({ r: 0, c });
            }
        }

        while (queue.length > 0) {
            const { r, c: cc } = queue.shift();
            neighborOffsets(r).forEach(([dr, dc]) => {
                const nr = r + dr, nc = cc + dc;
                const key = `${nr},${nc}`;
                if (validCell(nr, nc) && !visited.has(key) && this.grid[nr] && this.grid[nr][nc]) {
                    visited.add(key);
                    grounded.add(key);
                    queue.push({ r: nr, c: nc });
                }
            });
        }

        // Drop everything not grounded
        let dropped = 0;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const bub = this.grid[r] ? this.grid[r][c] : null;
                if (!bub) continue;
                if (grounded.has(`${r},${c}`)) continue;

                this.grid[r][c] = null;
                dropped++;

                // Falling animation
                const colorHex = COLORS[bub.getData("colorIdx")] || 0xffffff;
                this.burstParticles(bub.x, bub.y, colorHex, 4);
                this.tweens.add({
                    targets: bub,
                    y: GAME_H + 60,
                    rotation: Phaser.Math.FloatBetween(-3, 3),
                    alpha: 0,
                    duration: 600 + Math.random() * 300,
                    ease: "Quad.easeIn",
                    onComplete: () => bub.destroy()
                });
            }
        }

        if (dropped > 0) {
            this.shakeCamera(0.004 * dropped, 250);
            this.chromaFlash(0.003 * dropped);
            try { playDrop(dropped); } catch (e) {}
        }

        return dropped;
    }

    // ── Push a new row from the top (descent) ───────────────────
    pushRowDown() {
        // Check if bottom row has bubbles (game over)
        for (let c = 0; c < COLS; c++) {
            if (this.grid[ROWS - 1] && this.grid[ROWS - 1][c]) {
                this.triggerGameOver();
                return;
            }
        }

        // Shift all rows down by 1
        for (let r = ROWS - 1; r > 0; r--) {
            this.grid[r] = this.grid[r - 1];
            const maxColForRow = (r % 2 === 1) ? COLS - 1 : COLS;
            // Update sprite positions and data
            for (let c = 0; c < COLS; c++) {
                const bub = this.grid[r] ? this.grid[r][c] : null;
                if (!bub) continue;
                // If this column is invalid for the new row parity, destroy the bubble
                if (c >= maxColForRow) {
                    bub.destroy();
                    this.grid[r][c] = null;
                    continue;
                }
                bub.setData("row", r);
                const pos = gridToPixel(r, c);
                this.tweens.add({
                    targets: bub, x: pos.x, y: pos.y,
                    duration: 300, ease: "Bounce.easeOut"
                });
            }
        }

        // New top row — use pattern-aware spawning
        this.grid[0] = [];
        this.generatePatternRow(0);

        this.shakeCamera(0.008, 200);
        this.chromaFlash(0.005);

        // Flash danger line
        this.tweens.add({
            targets: this.dangerLine, alpha: 0.8,
            duration: 100, yoyo: true, repeat: 3
        });

        if (this.checkGameOver()) {
            this.triggerGameOver();
        }
    }

    // ── Spawn a new projectile ──────────────────────────────────
    spawnProjectile() {
        const ci = this.nextColorIdx;
        const isBomb = Math.random() < BOMB_CHANCE;

        // Pick next
        this.nextColorIdx = this.pickColor();
        this.nextPreview.setTexture("bub_" + this.nextColorIdx);

        const texKey = isBomb ? "bub_bomb" : ("bub_" + ci);
        this.projectile = this.add.image(GAME_W / 2, SHOOT_Y, texKey)
            .setData({ vx: 0, vy: 0, colorIdx: ci, isBomb });

        // Spawn animation
        this.projectile.setScale(0);
        this.tweens.add({
            targets: this.projectile,
            scaleX: 1, scaleY: 1,
            duration: 200, ease: "Back.easeOut"
        });
    }

    // ── Pick a color that exists in the grid ────────────────────
    pickColor() {
        const existing = new Set();
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const b = this.grid[r] ? this.grid[r][c] : null;
                if (b && !b.getData("isBomb")) existing.add(b.getData("colorIdx"));
            }
        }
        if (existing.size === 0) {
            return Phaser.Math.Between(0, Math.min(2 + this.level, COLORS.length - 1));
        }
        const arr = Array.from(existing);
        return Phaser.Math.RND.pick(arr);
    }

    // ── Clustered grid generation (blob painting) ───────────────
    generateClusteredGrid(numRows) {
        // Step 1: Create an empty color map
        const colorMap = [];
        for (let r = 0; r < numRows; r++) {
            const maxC = (r % 2 === 1) ? COLS - 1 : COLS;
            colorMap[r] = new Array(maxC).fill(-1);
        }

        // Step 2: Determine how many colors to use (scales with level)
        const numColors = Math.min(3 + Math.floor(this.level / 2), COLORS.length);
        const palette = [];
        const available = [];
        for (let i = 0; i < COLORS.length; i++) available.push(i);
        Phaser.Utils.Array.Shuffle(available);
        for (let i = 0; i < numColors; i++) palette.push(available[i]);

        // Step 3: Paint blobs — pick a random empty cell, flood-fill a cluster of 3-7
        let emptyCells = [];
        const refreshEmpty = () => {
            emptyCells = [];
            for (let r = 0; r < numRows; r++) {
                for (let c = 0; c < colorMap[r].length; c++) {
                    if (colorMap[r][c] === -1) emptyCells.push({ r, c });
                }
            }
        };
        refreshEmpty();

        while (emptyCells.length > 0) {
            const seed = Phaser.Math.RND.pick(emptyCells);
            const color = Phaser.Math.RND.pick(palette);
            const clusterSize = Phaser.Math.Between(3, 7);

            // BFS to paint a connected cluster
            const queue = [seed];
            const painted = new Set();
            painted.add(`${seed.r},${seed.c}`);
            colorMap[seed.r][seed.c] = color;
            let count = 1;

            while (queue.length > 0 && count < clusterSize) {
                const cur = queue.shift();
                const offsets = neighborOffsets(cur.r);
                Phaser.Utils.Array.Shuffle(offsets);
                for (const off of offsets) {
                    if (count >= clusterSize) break;
                    const nr = cur.r + off[0];
                    const nc = cur.c + off[1];
                    const key = `${nr},${nc}`;
                    if (nr >= 0 && nr < numRows && !painted.has(key)) {
                        const maxC2 = (nr % 2 === 1) ? COLS - 1 : COLS;
                        if (nc >= 0 && nc < maxC2 && colorMap[nr][nc] === -1) {
                            painted.add(key);
                            colorMap[nr][nc] = color;
                            queue.push({ r: nr, c: nc });
                            count++;
                        }
                    }
                }
            }
            refreshEmpty();
        }

        // Step 4: Add some gaps for visual interest (remove ~15% randomly)
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < colorMap[r].length; c++) {
                if (Math.random() < 0.15) colorMap[r][c] = -1;
            }
        }

        // Step 5: Place the bubbles
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < colorMap[r].length; c++) {
                if (colorMap[r][c] >= 0) {
                    const isBomb = Math.random() < BOMB_CHANCE;
                    this.placeBubble(r, c, colorMap[r][c], isBomb);
                }
            }
        }
    }

    // ── Pattern-aware row generation (for pushRowDown) ──────────
    generatePatternRow(row) {
        const maxC = (row % 2 === 1) ? COLS - 1 : COLS;

        // Look at row 1 (the row just below, after shift) to continue clusters
        const rowBelow = this.grid[row + 1];

        // Pick 2-3 colors to use in this row
        const existing = new Set();
        if (rowBelow) {
            for (let c = 0; c < COLS; c++) {
                const b = rowBelow[c];
                if (b && !b.getData("isBomb")) existing.add(b.getData("colorIdx"));
            }
        }
        let palette = Array.from(existing);
        if (palette.length === 0) {
            palette = [Phaser.Math.Between(0, COLORS.length - 1)];
        }
        // Maybe introduce one new color
        if (Math.random() < 0.3 && palette.length < COLORS.length) {
            const unused = [];
            for (let i = 0; i < COLORS.length; i++) {
                if (!existing.has(i)) unused.push(i);
            }
            if (unused.length > 0) palette.push(Phaser.Math.RND.pick(unused));
        }

        // Generate the row in runs of 2-4 same-colored cells
        let c = 0;
        while (c < maxC) {
            if (Math.random() < 0.2) { // 20% chance of gap
                c++;
                continue;
            }
            // Pick color — prefer matching neighbor below
            let color;
            const belowBub = rowBelow ? rowBelow[c] : null;
            if (belowBub && !belowBub.getData("isBomb") && Math.random() < 0.5) {
                color = belowBub.getData("colorIdx");
            } else {
                color = Phaser.Math.RND.pick(palette);
            }
            // Run length
            const runLen = Phaser.Math.Between(2, 4);
            for (let i = 0; i < runLen && c < maxC; i++, c++) {
                this.placeBubble(row, c, color, Math.random() < BOMB_CHANCE);
            }
        }
    }

    // ── Check game over ─────────────────────────────────────────
    checkGameOver() {
        // Any bubble in the danger zone?
        for (let r = ROWS - 3; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const b = this.grid[r] ? this.grid[r][c] : null;
                if (b) {
                    const pos = gridToPixel(r, c);
                    if (pos.y >= SHOOT_Y - 50) return true;
                }
            }
        }
        return false;
    }

    // ── Trigger Game Over ───────────────────────────────────────
    triggerGameOver() {
        if (this.gameOver) return;
        this.gameOver = true;

        try { playGameOver(); } catch (e) {}
        try { stopMusic(); } catch (e) {}

        // Destroy all bubbles with cascade
        let delay = 0;
        for (let r = ROWS - 1; r >= 0; r--) {
            for (let c = 0; c < COLS; c++) {
                const bub = this.grid[r] ? this.grid[r][c] : null;
                if (!bub) continue;
                this.time.delayedCall(delay, () => {
                    this.burstParticles(bub.x, bub.y, COLORS[bub.getData("colorIdx")] || 0xffffff, 6);
                    bub.destroy();
                });
                delay += 20;
            }
        }

        this.shakeCamera(0.02, 800);
        this.chromaFlash(0.015);

        // Game Over text
        this.time.delayedCall(delay + 200, () => {
            const go = this.add.text(GAME_W / 2, GAME_H / 2 - 40, "GAME OVER", {
                fontFamily: "monospace", fontSize: "42px", fontStyle: "bold",
                color: "#ff0055", stroke: "#330011", strokeThickness: 4
            }).setOrigin(0.5);
            this.tweens.add({
                targets: go, scaleX: 1.05, scaleY: 0.95,
                duration: 600, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
            });

            const sc = this.add.text(GAME_W / 2, GAME_H / 2 + 20, "SCORE: " + this.score, {
                fontFamily: "monospace", fontSize: "22px", color: "#ffffff"
            }).setOrigin(0.5);

            const again = this.add.text(GAME_W / 2, GAME_H / 2 + 70, "[ CLICK TO RETRY ]", {
                fontFamily: "monospace", fontSize: "18px", fontStyle: "bold",
                color: "#ffee00"
            }).setOrigin(0.5).setInteractive({ useHandCursor: true });
            this.tweens.add({
                targets: again, alpha: 0.4,
                duration: 500, yoyo: true, repeat: -1
            });

            const restart = () => {
                try { startMusic(); } catch (e) {}
                this.scene.restart();
            };
            again.on("pointerdown", restart);
            this.input.keyboard.on("keydown-SPACE", restart);
        });
    }

    // ── Score ───────────────────────────────────────────────────
    addScore(pts) {
        this.score += pts;
        this.scoreText.setText("SCORE: " + this.score);

        // Pop the score text
        this.tweens.add({
            targets: this.scoreText, scaleX: 1.3, scaleY: 1.3,
            duration: 100, yoyo: true, ease: "Quad.easeOut"
        });

        // Floating score number
        const pos = this.projectile
            ? { x: this.projectile.x, y: this.projectile.y }
            : { x: GAME_W / 2, y: GAME_H / 2 };
        const ft = this.add.text(pos.x, pos.y, "+" + pts, {
            fontFamily: "monospace", fontSize: "18px", fontStyle: "bold",
            color: "#ffee00", stroke: "#000", strokeThickness: 2
        }).setOrigin(0.5);
        this.tweens.add({
            targets: ft, y: ft.y - 60, alpha: 0,
            duration: 800, ease: "Quad.easeOut",
            onComplete: () => ft.destroy()
        });
    }

    // ═══════════════════════════════════════════════════════════════
    //  JUICE HELPERS
    // ═══════════════════════════════════════════════════════════════

    squash(target, sx, sy, duration) {
        if (!target || !target.scene) return;
        this.tweens.add({
            targets: target, scaleX: sx, scaleY: sy,
            duration: duration / 2, yoyo: true, ease: "Quad.easeOut"
        });
    }

    shakeCamera(intensity, duration) {
        this.cameras.main.shake(duration, intensity);
    }

    chromaFlash(intensity) {
        if (!this.chromaPipeline) return;
        // chromaPipeline is the array returned by setPostPipeline
        const pipes = this.cameras.main.getPostPipeline(ChromaticPipeline);
        if (pipes) {
            const p = Array.isArray(pipes) ? pipes[0] : pipes;
            if (p && p.setIntensity) p.setIntensity(intensity);
        }
    }

    burstParticles(x, y, color, count) {
        const actual = PERF_LOW ? Math.min(count, PARTICLE_COUNT) : count;
        const durMult = TWEEN_DURATION_MULT;
        for (let i = 0; i < actual; i++) {
            const sz = Phaser.Math.Between(3, 7);
            const p = this.add.rectangle(x, y, sz, sz, color, 1);
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 200;
            this.tweens.add({
                targets: p,
                x: x + Math.cos(angle) * speed,
                y: y + Math.sin(angle) * speed,
                alpha: 0, scaleX: 0, scaleY: 0,
                rotation: Phaser.Math.FloatBetween(-4, 4),
                duration: (300 + Math.random() * 400) * durMult,
                ease: "Quad.easeOut",
                onComplete: () => p.destroy()
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  PHASER CONFIG
// ═══════════════════════════════════════════════════════════════════
const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: GAME_W,
        height: GAME_H,
        parent: "game",
    },
    backgroundColor: "#0a0a12",
    scene: [MainMenu, GameScene],
    pipeline: { ChromaticPipeline },
    physics: {
        default: "arcade",
        arcade: { gravity: { y: 0 }, debug: false }
    }
};

const game = new Phaser.Game(config);

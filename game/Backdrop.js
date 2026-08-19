.pragma library

.import "World.js" as World
.import "Draw.js" as Draw

// The sky, the hills and the floor grid.
//
// All of this is new -- the original drew a flat background rectangle, a
// ground line and a fan of grid lines, and nothing else. What it buys is
// depth: the play field used to be objects floating on a colour, and it now
// has a distance behind it for them to be in front of.
//
// It is painted onto its own canvas and repainted only when the palette, the
// wave or the cabinet size changes -- once per theme switch in practice, not
// once per frame. That is why the stars are placed by World.seeded() rather
// than Math.random(): a repaint has to reproduce the same sky, or the
// constellations reshuffle every time the wave counter ticks over.

var STAR_SEED = 0x51ACE
var RIDGE_SEED = 0xB1D6E

// Three depth bands. Far stars are small and dim and there are a lot of them;
// near stars are few, bigger, and bright enough to have a halo.
var BANDS = [
    { count: 110, minR: 0.15, maxR: 0.30, alpha: 0.22, halo: false },
    { count: 46,  minR: 0.30, maxR: 0.50, alpha: 0.40, halo: false },
    { count: 16,  minR: 0.50, maxR: 0.80, alpha: 0.70, halo: true }
]

// Stars stop short of the horizon haze, which would swallow them anyway.
var STAR_FLOOR = 190

function drawSky(ctx, pal) {
    // A vertical gradient rather than a flat fill. The horizon end carries the
    // haze colour, so the sky gets lighter towards the ground the way a real
    // one does -- and, usefully, it separates the cities from the void above
    // them without drawing a line to do it.
    var g = ctx.createLinearGradient(0, 0, 0, World.GROUND_Y)
    g.addColorStop(0.00, World.rgba(pal.sky, 1))
    g.addColorStop(0.62, World.rgba(pal.sky, 1))
    g.addColorStop(1.00, World.rgba(pal.haze, 1))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, World.GAME_W, World.GROUND_Y)

    // Below the ground line is the floor, which is darker than the sky.
    ctx.fillStyle = World.rgba(World.mix(pal.sky, { r: 0, g: 0, b: 0 }, 0.25), 1)
    ctx.fillRect(0, World.GROUND_Y, World.GAME_W, World.GAME_H - World.GROUND_Y)
}

function drawStars(ctx, pal) {
    var rnd = World.seeded(STAR_SEED)

    for (var b = 0; b < BANDS.length; b++) {
        var band = BANDS[b]
        for (var i = 0; i < band.count; i++) {
            var x = rnd() * World.GAME_W
            var y = rnd() * STAR_FLOOR
            var r = band.minR + rnd() * (band.maxR - band.minR)

            // Fade the band out as it approaches the haze, so stars do not
            // sit on top of the horizon glow looking like dust on the screen.
            var fade = 1 - World.clamp((y - STAR_FLOOR * 0.55)
                                       / (STAR_FLOOR * 0.45), 0, 1) * 0.85
            var a = band.alpha * fade
            if (a <= 0.01) continue

            if (band.halo)
                Draw.glow(ctx, x, y, r * 5, pal.star, a * 0.35)

            ctx.fillStyle = World.rgba(pal.star, a)
            ctx.beginPath()
            ctx.arc(x, y, r, 0, Math.PI * 2)
            ctx.fill()
        }
    }
}

// One ridgeline: a jagged filled silhouette rising from the ground.
//
// Drawn as a filled polygon rather than an outline. Everything else on screen
// is wireframe, and that is exactly why the hills are solid -- a wireframe
// mountain would read as another object in play, and this needs to read as
// something you cannot shoot.
function drawRidge(ctx, colour, seed, baseY, height, steps) {
    var rnd = World.seeded(seed)
    var step = World.GAME_W / steps

    ctx.beginPath()
    ctx.moveTo(-2, baseY)

    var y = baseY - height * (0.3 + rnd() * 0.4)
    ctx.lineTo(-2, y)
    for (var i = 0; i <= steps; i++) {
        var x = i * step
        // Random walk with a pull back toward the middle of the band, so the
        // ridge wanders without drifting off the top or flattening out.
        var target = baseY - height * (0.25 + rnd() * 0.75)
        y = y + (target - y) * 0.55
        ctx.lineTo(x, y)
    }
    ctx.lineTo(World.GAME_W + 2, baseY)
    ctx.closePath()
    ctx.fillStyle = World.rgba(colour, 1)
    ctx.fill()
}

function drawHorizon(ctx, pal, lw) {
    // Haze sitting on the ground line, brightest at the line itself. This is
    // the single cheapest thing in the whole renderer and it does more for the
    // sense of a lit world than anything except the explosions.
    var g = ctx.createLinearGradient(0, World.GROUND_Y - 22, 0, World.GROUND_Y)
    g.addColorStop(0, World.rgba(pal.ground, 0))
    g.addColorStop(1, World.rgba(pal.ground, 0.20))
    ctx.fillStyle = g
    ctx.fillRect(0, World.GROUND_Y - 22, World.GAME_W, 22)

    Draw.glowSeg(ctx, 0, World.GROUND_Y, World.GAME_W, World.GROUND_Y,
                 pal.ground, lw, 1.8, 0.85)
}

// The floor: receding horizontal rules plus a fan of verticals converging on a
// vanishing point. The original's, kept, but with the fade moved into the
// stroke alpha so the far lines actually recede instead of stopping abruptly.
function drawGrid(ctx, pal, lw) {
    var bottom = World.GAME_H
    var vanishX = World.GAME_W / 2
    var vanishY = World.GROUND_Y

    var verts = 16
    for (var i = 0; i <= verts; i++) {
        var baseX = (i / verts) * World.GAME_W
        // Lines near the vanishing point are the ones running away from you,
        // so they are the faint ones.
        var spread = Math.abs(baseX - vanishX) / vanishX
        ctx.beginPath()
        ctx.moveTo(vanishX, vanishY)
        ctx.lineTo(baseX, bottom)
        ctx.strokeStyle = World.rgba(pal.grid, 0.16 + spread * 0.30)
        ctx.lineWidth = lw
        ctx.stroke()
    }

    // Horizontal rules, spaced so they bunch up toward the horizon.
    var rules = 6
    for (var j = 1; j <= rules; j++) {
        var t = j / rules
        var y = World.GROUND_Y + (bottom - World.GROUND_Y) * (t * t)
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(World.GAME_W, y)
        ctx.strokeStyle = World.rgba(pal.grid, 0.42 * (1 - t * 0.65))
        ctx.lineWidth = lw
        ctx.stroke()
    }
}

// The first few star positions, as a string. The sky is painted once and
// repainted on a theme change, so it has to come out identical every time --
// Math.random() here would reshuffle the constellations every time the wave
// counter ticked over, and that is exactly the kind of thing nobody notices
// until it is shipped.
function signature() {
    var rnd = World.seeded(STAR_SEED)
    var out = []
    for (var i = 0; i < 6; i++)
        out.push(rnd().toFixed(6))
    return out.join(",")
}

// Everything, in back-to-front order.
function draw(ctx, pal, lw) {
    drawSky(ctx, pal)
    drawStars(ctx, pal)
    drawRidge(ctx, pal.ridgeFar, RIDGE_SEED, World.GROUND_Y, 26, 22)
    drawRidge(ctx, pal.ridgeNear, RIDGE_SEED ^ 0x9E37, World.GROUND_Y, 15, 16)
    drawHorizon(ctx, pal, lw)
    drawGrid(ctx, pal, lw)
}

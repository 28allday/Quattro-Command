.import "World.js" as World
.import "Draw.js" as Draw

// Bombers from wave 2, satellites from wave 4, killer satellites from wave 8.
//
// One at a time, on a five-to-eight second cooldown, crossing the screen and
// dropping warheads as they go. All of that is the original's.
//
// The drawings are the original's too -- a swept-wing strategic bomber and a
// hexagonal orbital platform with two solar arrays, both of which are far more
// line work than a sprite of that size needs and both of which are the reason
// the fliers read as machines. New: engine glow behind the bomber, a nav light
// on each wingtip, a glint that travels across the solar panels, and the
// killer satellite's eye now takes the theme's alarm colour rather than the
// hard-coded red the original used, which was the one place the old game
// stopped following your desktop.

var BOMBER = "bomber"
var SATELLITE = "satellite"
var KILLER = "killer_sat"

var COOLDOWN_MIN = 5
var COOLDOWN_MAX = 8

var active = []
var cooldown = 0

function pickCooldown() {
    return COOLDOWN_MIN + Math.random() * (COOLDOWN_MAX - COOLDOWN_MIN)
}

function canBomber(wave) { return wave >= 2 }
function canSatellite(wave) { return wave >= 4 }
function canKiller(wave) { return wave >= 8 }

function spawn(wave) {
    var bomber = canBomber(wave)
    var sat = canSatellite(wave)
    var killer = canKiller(wave)
    if (!bomber && !sat) return null

    var r = Math.random()
    var kind
    if (killer && r < 0.2) kind = KILLER
    else if (sat && bomber) kind = (r < 0.6 ? BOMBER : SATELLITE)
    else if (sat) kind = SATELLITE
    else kind = BOMBER

    var fromLeft = Math.random() < 0.5
    var speed, y
    if (kind === BOMBER) { speed = 20; y = World.GROUND_Y * 0.6 }
    else if (kind === KILLER) { speed = 45; y = World.GROUND_Y * 0.25 }
    else { speed = 30; y = World.GROUND_Y * 0.3 }

    var f = {
        kind: kind,
        x: fromLeft ? -8 : World.GAME_W + 8,
        y: y,
        speed: speed,
        dir: fromLeft ? 1 : -1,
        age: 0,
        seed: Math.random() * Math.PI * 2,
        launchTimer: 1.5 + Math.random(),
        points: kind === KILLER ? 150 : 100
    }
    active.push(f)
    return f
}

function init() {
    active = []
    cooldown = pickCooldown()
}

function clear() {
    active = []
    cooldown = pickCooldown()
}

// `world.hits(x, y)` answers whether a point is inside a fireball. Returns the
// frame's events for Game.qml to act on.
function update(dt, world) {
    var wave = world.wave
    var events = { destroyed: [], drops: [], spawned: null }

    // Only ever one on screen, and only once the previous one has gone.
    if (active.length === 0 && (canBomber(wave) || canSatellite(wave))) {
        cooldown -= dt
        if (cooldown <= 0) {
            events.spawned = spawn(wave)
            cooldown = pickCooldown()
        }
    }

    for (var i = active.length - 1; i >= 0; i--) {
        var f = active[i]
        f.age += dt
        f.x += f.dir * f.speed * dt

        if (world.hits(f.x, f.y)) {
            events.destroyed.push({ x: f.x, y: f.y, points: f.points, kind: f.kind })
            active.splice(i, 1)
            cooldown = pickCooldown()
            continue
        }

        if ((f.dir > 0 && f.x > World.GAME_W + 10)
                || (f.dir < 0 && f.x < -10)) {
            active.splice(i, 1)
            cooldown = pickCooldown()
            continue
        }

        f.launchTimer -= dt
        if (f.launchTimer <= 0) {
            f.launchTimer = (f.kind === KILLER)
                    ? 1.2 + Math.random() * 0.6
                    : 2.0 + Math.random()
            if (f.x > 0 && f.x < World.GAME_W)
                events.drops.push({ x: f.x, y: f.y })
        }
    }

    return events
}

function allDone() { return active.length === 0 }
function count() { return active.length }
function getAll() { return active }

// ----------------------------------------------------------------- drawing

function drawBomber(ctx, f, pal, lw, clock, pulse) {
    var x = f.x, y = f.y, d = f.dir

    // Engine glow, trailing behind. Two pods, both flickering.
    var flick = 0.7 + Math.sin(clock * 24 + f.seed) * 0.3
    Draw.glow(ctx, x - 4 * d, y - 2.7, 3.4, pal.alarm, 0.28 * flick)
    Draw.glow(ctx, x - 4 * d, y + 2.7, 3.4, pal.alarm, 0.28 * flick)

    // Fuselage
    Draw.glowPoly(ctx, [
        x + 7*d, y,
        x + 5*d, y - 0.8,
        x + 2*d, y - 1,
        x - 3*d, y - 1,
        x - 6*d, y - 0.5,
        x - 8*d, y - 3,
        x - 8*d, y - 0.5,
        x - 6*d, y + 0.5,
        x + 2*d, y + 1,
        x + 5*d, y + 0.5,
        x + 7*d, y
    ], pal.missile, lw, 1.2, pulse)

    // Swept wings
    Draw.glowPoly(ctx, [x + 2*d, y - 1, x - 1*d, y - 5, x - 3*d, y - 4.5, x - 3*d, y - 1],
                  pal.missile, lw, 1.0, pulse)
    Draw.glowPoly(ctx, [x + 2*d, y + 1, x - 1*d, y + 5, x - 3*d, y + 4.5, x - 3*d, y + 1],
                  pal.missile, lw, 1.0, pulse)

    // Engine pods
    Draw.glowPoly(ctx, [x, y - 2.5, x - 1*d, y - 3, x - 1.5*d, y - 2.5],
                  pal.missile, lw, 0.6, pulse * 0.6)
    Draw.glowPoly(ctx, [x, y + 2.5, x - 1*d, y + 3, x - 1.5*d, y + 2.5],
                  pal.missile, lw, 0.6, pulse * 0.6)

    // Tailplane
    Draw.glowPoly(ctx, [x - 6*d, y - 0.5, x - 7*d, y - 2, x - 8*d, y - 1.5],
                  pal.missile, lw, 0.6, pulse * 0.6)
    Draw.glowPoly(ctx, [x - 6*d, y + 0.5, x - 7*d, y + 1.5, x - 8*d, y + 1],
                  pal.missile, lw, 0.6, pulse * 0.6)

    // Cockpit
    Draw.glowPoly(ctx, [x + 4*d, y - 0.5, x + 3*d, y - 0.8, x + 2*d, y - 0.8],
                  pal.bright, lw, 0.5, pulse * 0.5)

    // Wingtip nav lights, out of phase with each other the way aircraft ones
    // are -- and the detail that makes a shape crossing a dark sky read as a
    // thing with a crew rather than a cursor.
    if (Math.sin(clock * 3 + f.seed) > 0.55)
        Draw.spark(ctx, x - 1*d, y - 5, 0.45, pal.bright, 0.9)
    if (Math.sin(clock * 3 + f.seed + Math.PI) > 0.55)
        Draw.spark(ctx, x - 1*d, y + 5, 0.45, pal.alarm, 0.9)
}

function drawSatellite(ctx, f, pal, lw, clock, pulse) {
    var x = f.x, y = f.y
    var s = 2
    var panel = 3.5

    // Hexagonal bus
    Draw.glowPoly(ctx, [
        x-s, y-s*0.5, x, y-s, x+s, y-s*0.5,
        x+s, y+s*0.5, x, y+s, x-s, y+s*0.5, x-s, y-s*0.5
    ], pal.missile, lw, 1.2, pulse)

    // Solar arrays, both sides
    var sides = [-1, 1]
    for (var k = 0; k < sides.length; k++) {
        var sd = sides[k]
        var inner = x + sd * (s + 1.5)
        var outer = x + sd * (s + panel + 1.5)

        Draw.glowPoly(ctx, [x + sd * s, y, inner, y], pal.missile, lw, 0.9, pulse)
        Draw.glowPoly(ctx, [
            inner, y - 2.5, outer, y - 2.5, outer, y + 2.5, inner, y + 2.5, inner, y - 2.5
        ], pal.missile, lw, 0.9, pulse)

        // Grid lines
        var mid = (inner + outer) / 2
        Draw.glowPoly(ctx, [mid, y - 2.5, mid, y + 2.5], pal.missile, lw, 0.4, pulse * 0.35)
        Draw.glowPoly(ctx, [inner, y, outer, y], pal.missile, lw, 0.4, pulse * 0.35)

        // A glint travelling across the panel. Sunlight on glass, and the only
        // moving highlight on an object that is otherwise rigid.
        var t = (clock * 0.5 + f.seed + k * 0.5) % 2
        if (t < 1) {
            var gx = inner + (outer - inner) * t
            var g = ctx.createLinearGradient(gx - 1.2, 0, gx + 1.2, 0)
            g.addColorStop(0.0, World.rgba(pal.bright, 0))
            g.addColorStop(0.5, World.rgba(pal.bright, 0.35))
            g.addColorStop(1.0, World.rgba(pal.bright, 0))
            ctx.fillStyle = g
            ctx.fillRect(gx - 1.2, y - 2.5, 2.4, 5)
        }
    }

    // Antenna
    Draw.glowPoly(ctx, [x, y - s, x + 0.5, y - s - 2], pal.missile, lw, 0.5, pulse * 0.6)
    Draw.glowPoly(ctx, [x - 1, y - s - 2.5, x + 1, y - s - 1.5], pal.missile, lw, 0.5, pulse * 0.6)

    if (Math.sin(clock * 8 + f.seed) > 0.5)
        Draw.spark(ctx, x, y, 0.5, pal.bright, 0.85)

    // ---- killer variant: spikes and an eye
    if (f.kind === KILLER) {
        var beat = 0.6 + Math.sin(clock * 14 + f.seed) * 0.4
        var spikes = [
            [x, y-s, x, y-s-2],
            [x, y+s, x, y+s+2],
            [x-s, y-s*0.5, x-s-1.5, y-s-1],
            [x+s, y-s*0.5, x+s+1.5, y-s-1],
            [x-s, y+s*0.5, x-s-1.5, y+s+1],
            [x+s, y+s*0.5, x+s+1.5, y+s+1]
        ]
        for (var sp = 0; sp < spikes.length; sp++)
            Draw.glowPoly(ctx, spikes[sp], pal.alarm, lw, 1.0, beat)

        Draw.glow(ctx, x, y, 5.5, pal.alarm, 0.35 * beat)
        Draw.spark(ctx, x, y, 0.9, pal.alarm, beat)
    }
}

function draw(ctx, pal, lw, clock) {
    for (var i = 0; i < active.length; i++) {
        var f = active[i]
        var pulse = 0.75 + Math.sin(clock * 12 + f.seed) * 0.25
        if (f.kind === BOMBER) drawBomber(ctx, f, pal, lw, clock, pulse)
        else drawSatellite(ctx, f, pal, lw, clock, pulse)
    }
}

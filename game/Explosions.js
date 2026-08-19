.import "World.js" as World
.import "Draw.js" as Draw

// The fireballs, and the only thing in the game that kills anything.
//
// The timing is the original's and is load-bearing: 0.3s expanding, 0.5s held
// at full radius, 0.3s contracting, twelve units across, eight of them at
// once. That held half-second is what makes chaining possible -- you are
// aiming at where a warhead will be, not where it is -- so none of it moved.
//
// The drawing is new, but it keeps the original's one non-negotiable property:
// there is NO OUTLINE anywhere on a fireball, so two that touch merge into a
// single mass rather than reading as two overlapping discs. Chain reactions are
// the whole game and that merging is what they look like.
//
// Four layers, all of them fills: a halo, the fireball itself (a boiling blob,
// not a circle, but filled rather than stroked), three lobes turning inside it,
// and light thrown onto the ground underneath.

var EXPAND_TIME = 0.3
var HOLD_TIME = 0.5
var CONTRACT_TIME = 0.3
var MAX_RADIUS = 12
var MAX_ACTIVE = 8

var active = []

// Returns the new explosion, or null if the field is already at its limit.
// The caller uses it to spawn debris and start a sound, which keeps this
// module free of any knowledge of either.
function add(x, y) {
    if (active.length >= MAX_ACTIVE) return null
    var e = {
        x: x, y: y,
        radius: 0,
        maxRadius: MAX_RADIUS,
        phase: "expanding",
        timer: 0,
        age: 0,
        // A per-explosion phase offset, so two fireballs side by side boil out
        // of step with each other instead of pulsing as one.
        seed: Math.random() * Math.PI * 2
    }
    active.push(e)
    return e
}

function update(dt) {
    for (var i = active.length - 1; i >= 0; i--) {
        var e = active[i]
        e.timer += dt
        e.age += dt

        if (e.phase === "expanding") {
            e.radius = e.maxRadius * (e.timer / EXPAND_TIME)
            if (e.timer >= EXPAND_TIME) {
                e.phase = "holding"
                e.timer = 0
                e.radius = e.maxRadius
            }
        } else if (e.phase === "holding") {
            e.radius = e.maxRadius
            if (e.timer >= HOLD_TIME) {
                e.phase = "contracting"
                e.timer = 0
            }
        } else {
            e.radius = e.maxRadius * (1 - e.timer / CONTRACT_TIME)
            if (e.timer >= CONTRACT_TIME)
                active.splice(i, 1)
        }
    }
}

// Anything inside any fireball dies. The kill radius is the drawn radius, not
// the shockwave -- the shockwave is scenery.
function hits(x, y) {
    for (var i = 0; i < active.length; i++) {
        var e = active[i]
        var dx = e.x - x, dy = e.y - y
        if (dx * dx + dy * dy <= e.radius * e.radius)
            return true
    }
    return false
}

function getAll() {
    return active
}

function anyActive() {
    return active.length > 0
}


function clear() {
    active = []
}

// ----------------------------------------------------------------- drawing

function draw(ctx, pal, lw, clock) {
    for (var i = 0; i < active.length; i++) {
        var e = active[i]
        if (e.radius <= 0.4) continue

        // The original flashed between two theme colours at 40 rad/s. That
        // strobe is the single most recognisable thing about how this game
        // looks, so the rate is kept -- but it now steps through three hot
        // colours instead of two, which is both closer to what the arcade did
        // and proof against a theme whose accent happens to equal color4.
        var stepIdx = Math.floor(e.age * 19) % 3
        var body = stepIdx === 0 ? pal.exp1 : (stepIdx === 1 ? pal.exp2 : pal.exp3)

        // ---- outer halo
        Draw.glow(ctx, e.x, e.y, e.radius * 2.3, pal.glow, 0.13)

        // ---- fireball
        //
        // Near-opaque on purpose. Two overlapping regions of the same colour
        // at the same alpha composite into one flat region with no seam; at
        // 70% they show their overlap as a bright lens, which is exactly the
        // "two discs" reading the outline was removed to avoid.
        Draw.fireball(ctx, e.x, e.y, e.radius, pal.core, body, 0.97, clock, e.seed)

        // ---- three lobes turning inside it
        //
        // A single radial gradient is a smooth disc, and a smooth disc reads
        // as a light rather than as burning gas. Three smaller blobs orbiting
        // slowly off-centre give the interior something to be doing; they cost
        // three gradients and they are the difference between a fireball and a
        // headlamp.
        for (var b = 0; b < 3; b++) {
            var ang = e.seed + b * 2.094 + e.age * 2.2
            var orbit = e.radius * 0.34
            Draw.glow(ctx,
                      e.x + Math.cos(ang) * orbit,
                      e.y + Math.sin(ang) * orbit,
                      e.radius * 0.52, pal.core, 0.22)
        }

        // ---- light on the ground below
        if (e.y > World.GROUND_Y - 60) {
            var reach = e.radius * 3.2
            var g = ctx.createLinearGradient(e.x - reach, 0, e.x + reach, 0)
            g.addColorStop(0.0, World.rgba(body, 0))
            g.addColorStop(0.5, World.rgba(body, 0.30 * (e.radius / MAX_RADIUS)))
            g.addColorStop(1.0, World.rgba(body, 0))
            ctx.fillStyle = g
            ctx.fillRect(e.x - reach, World.GROUND_Y - 1.5, reach * 2, 3)
        }
    }
}

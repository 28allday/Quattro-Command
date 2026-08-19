.import "World.js" as World
.import "Draw.js" as Draw

// Your missiles: fired at a point, fly a straight line, detonate on arrival.
//
// Eight in the air at once, as before. That cap is the game's real resource,
// more than the thirty rounds are -- it is what stops the answer to a heavy
// wave being to empty every launcher at the sky.

var MAX_IN_FLIGHT = 8

var active = []

function fire(startX, startY, targetX, targetY, speed) {
    if (active.length >= MAX_IN_FLIGHT) return null

    var dx = targetX - startX
    var dy = targetY - startY
    var dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) return null

    var m = {
        startX: startX, startY: startY,
        targetX: targetX, targetY: targetY,
        x: startX, y: startY,
        speed: speed,
        dirX: dx / dist, dirY: dy / dist,
        totalDist: dist,
        age: 0,
        emberTimer: 0
    }
    active.push(m)
    return m
}

// Returns the points where missiles arrived this frame. Game.qml turns those
// into explosions -- this module has no idea what one is.
function update(dt) {
    var detonations = []

    for (var i = active.length - 1; i >= 0; i--) {
        var m = active[i]
        m.age += dt
        m.emberTimer += dt

        m.x += m.dirX * m.speed * dt
        m.y += m.dirY * m.speed * dt

        if (World.dist(m.startX, m.startY, m.x, m.y) >= m.totalDist) {
            detonations.push({ x: m.targetX, y: m.targetY })
            active.splice(i, 1)
        }
    }

    return detonations
}

function count() { return active.length }
function full() { return active.length >= MAX_IN_FLIGHT }
function getAll() { return active }
function clear() { active = [] }

function draw(ctx, pal, lw, clock) {
    for (var i = 0; i < active.length; i++) {
        var m = active[i]

        Draw.trail(ctx, m.startX, m.startY, m.x, m.y, pal.abm, lw, 0.9, 1.2)

        // The head: a hot point with a halo and a tiny flicker, so an ABM in
        // flight is unmistakably yours even against a sky full of warheads.
        var flicker = 0.85 + Math.sin(m.age * 42) * 0.15
        Draw.glow(ctx, m.x, m.y, 5.5, pal.abm, 0.35 * flicker)
        Draw.spark(ctx, m.x, m.y, 0.9, pal.core, flicker)
    }
}

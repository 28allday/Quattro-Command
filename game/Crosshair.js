.import "World.js" as World
.import "Draw.js" as Draw

// The reticle, and the markers left on every point you have fired at.
//
// The markers are the original's and they matter more than they look: an ABM
// takes over a second to cross the screen from a flank battery, so without a
// mark on the map you cannot tell an area you have already covered from one
// you have not, and you spend rounds twice.
//
// New here: the marker plays a short lock-on -- a square that snaps inward
// onto the point over the first fifth of a second -- and the reticle carries a
// slowly counter-rotating outer ring, which is the cheapest possible way to
// make a static overlay look like an instrument that is switched on.

var LOCK_TIME = 0.18

var x = World.GAME_W / 2
var y = World.GAME_H / 2
var markers = []

function setPosition(nx, ny) {
    x = World.clamp(nx, 0, World.GAME_W)
    y = World.clamp(ny, 0, World.GAME_H)
}

function position() { return { x: x, y: y } }

function addMarker(mx, my) {
    markers.push({ x: mx, y: my, age: 0 })
}

function update(dt) {
    for (var i = 0; i < markers.length; i++)
        markers[i].age += dt
}

// Called when an ABM arrives: clear the mark for that point.
function removeMarker(mx, my) {
    for (var i = markers.length - 1; i >= 0; i--) {
        if (Math.abs(markers[i].x - mx) < 1 && Math.abs(markers[i].y - my) < 1) {
            markers.splice(i, 1)
            return
        }
    }
}

function clear() { markers = [] }
function count() { return markers.length }

function draw(ctx, pal, lw, clock, ready) {
    // ---- target markers
    for (var i = 0; i < markers.length; i++) {
        var m = markers[i]
        var lock = World.clamp(m.age / LOCK_TIME, 0, 1)
        // Snaps in from four units out to two and a half.
        var s = World.lerp(4.4, 2.5, lock)
        var a = (0.35 + Math.sin(m.age * 15) * 0.3) * (0.35 + lock * 0.65)

        Draw.glowPoly(ctx, [
            m.x - s, m.y - s, m.x + s, m.y - s,
            m.x + s, m.y + s, m.x - s, m.y + s, m.x - s, m.y - s
        ], pal.crosshair, lw, 0.7, a)
    }

    // ---- reticle
    //
    // Dimmed while there is nothing left to fire, which is a faster read than
    // counting the rounds under the trucks.
    var alpha = ready ? 1 : 0.35
    var colour = ready ? pal.crosshair : pal.dim

    var size = 5, gap = 1.5
    Draw.glowPoly(ctx, [x-size, y-gap, x-size, y-size, x-gap, y-size], colour, lw, 1.3, alpha)
    Draw.glowPoly(ctx, [x+gap, y-size, x+size, y-size, x+size, y-gap], colour, lw, 1.3, alpha)
    Draw.glowPoly(ctx, [x+size, y+gap, x+size, y+size, x+gap, y+size], colour, lw, 1.3, alpha)
    Draw.glowPoly(ctx, [x-gap, y+size, x-size, y+size, x-size, y+gap], colour, lw, 1.3, alpha)

    // Outer ring, broken into four arcs and turning slowly the other way.
    var spin = -clock * 0.55
    for (var q = 0; q < 4; q++) {
        var a0 = spin + q * Math.PI / 2 + 0.28
        var a1 = spin + q * Math.PI / 2 + Math.PI / 2 - 0.28
        ctx.beginPath()
        ctx.arc(x, y, 7.6, a0, a1)
        ctx.strokeStyle = World.rgba(colour, 0.35 * alpha)
        ctx.lineWidth = lw
        ctx.stroke()
    }

    Draw.spark(ctx, x, y, 0.5, ready ? pal.bright : pal.dim, alpha)
}

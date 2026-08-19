.import "World.js" as World
.import "Draw.js" as Draw

// Debris, embers, smoke and exhaust.
//
// Entirely new -- the original had nothing of the kind. It is what stops an
// interception from being an event that simply stops: a warhead now comes
// apart into things that arc, fall, and go out, and the fireball leaves smoke
// that is still drifting when the next one goes up.
//
// Particles carry a palette *key* rather than a colour, and the renderer looks
// it up per frame. Storing the colour would freeze a spark at the theme that
// was active when it was struck, which is visible the moment you switch theme
// mid-wave -- the one thing this port gained over the original that it would
// be silly to lose here.

var MAX = 420

var GRAVITY = 26          // field units per second squared

var list = []

function push(p) {
    // Oldest first when the cap is reached. A hard cap matters: a wave of
    // MIRVs intercepted together can ask for several hundred at once, and the
    // canvas is the thing that pays for it.
    if (list.length >= MAX) list.shift()
    list.push(p)
}

// A shower of sparks thrown out from a point. `spread` in radians, centred on
// `aim`; omit both for a full circle.
function burst(x, y, count, speed, key, aim, spread) {
    for (var i = 0; i < count; i++) {
        var a = (aim === undefined)
                ? Math.random() * Math.PI * 2
                : aim + (Math.random() - 0.5) * (spread === undefined ? Math.PI * 2 : spread)
        var s = speed * (0.35 + Math.random() * 0.85)
        push({
            kind: "spark",
            x: x, y: y,
            vx: Math.cos(a) * s,
            vy: Math.sin(a) * s,
            life: 0.5 + Math.random() * 0.9,
            age: 0,
            size: 0.25 + Math.random() * 0.35,
            drag: 0.94,
            key: key || "core"
        })
    }
}

// Heavier fragments that tumble as they fall -- a short line rather than a
// dot, rotating. Used when something built out of lines comes apart.
function debris(x, y, count, speed, key) {
    for (var i = 0; i < count; i++) {
        var a = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7
        var s = speed * (0.4 + Math.random() * 0.8)
        push({
            kind: "debris",
            x: x, y: y,
            vx: Math.cos(a) * s * (Math.random() < 0.5 ? -1 : 1),
            vy: Math.sin(a) * s,
            rot: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 9,
            len: 0.8 + Math.random() * 1.6,
            life: 1.1 + Math.random() * 1.2,
            age: 0,
            drag: 0.99,
            key: key || "dim"
        })
    }
}

// A puff that grows and thins. Slow, and it drifts upward.
function smoke(x, y, count, key) {
    for (var i = 0; i < count; i++) {
        push({
            kind: "smoke",
            x: x + (Math.random() - 0.5) * 3,
            y: y + (Math.random() - 0.5) * 3,
            vx: (Math.random() - 0.5) * 4,
            vy: -2 - Math.random() * 5,
            r0: 1.2 + Math.random() * 1.6,
            grow: 4 + Math.random() * 6,
            life: 1.4 + Math.random() * 1.6,
            age: 0,
            key: key || "dim"
        })
    }
}

// One exhaust ember, dropped behind a missile. Called every few frames rather
// than every frame -- a continuous stream of these is what the gradient trail
// is already doing, and doubling it just costs.
function ember(x, y, key) {
    push({
        kind: "ember",
        x: x, y: y,
        vx: (Math.random() - 0.5) * 5,
        vy: (Math.random() - 0.5) * 5 + 3,
        life: 0.35 + Math.random() * 0.5,
        age: 0,
        size: 0.2 + Math.random() * 0.25,
        drag: 0.90,
        key: key || "missile"
    })
}

function update(dt) {
    for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i]
        p.age += dt
        if (p.age >= p.life) { list.splice(i, 1); continue }

        if (p.kind === "smoke") {
            p.x += p.vx * dt
            p.y += p.vy * dt
            p.vy *= 0.97           // rises, then stalls
        } else {
            p.vy += GRAVITY * dt
            var d = Math.pow(p.drag, dt * 60)
            p.vx *= d
            p.vy *= d
            p.x += p.vx * dt
            p.y += p.vy * dt
            if (p.kind === "debris") {
                p.rot += p.spin * dt
                // Fragments that reach the floor stop dead there rather than
                // falling through it.
                if (p.y > World.GROUND_Y) {
                    p.y = World.GROUND_Y
                    p.vy = 0
                    p.vx *= 0.6
                    p.spin *= 0.5
                }
            }
        }
    }
}

function count() { return list.length }
function anyActive() { return list.length > 0 }
function clear() { list = [] }

function draw(ctx, pal, lw) {
    for (var i = 0; i < list.length; i++) {
        var p = list[i]
        var t = p.age / p.life
        var colour = pal[p.key] || pal.core

        if (p.kind === "smoke") {
            var r = p.r0 + p.grow * t
            // Fades in fast, out slowly -- a puff that appears at full
            // strength reads as a flash rather than as smoke.
            var a = 0.16 * Math.min(1, t * 6) * (1 - t)
            Draw.glow(ctx, p.x, p.y, r, colour, a)

        } else if (p.kind === "debris") {
            var fade = 1 - t * t
            var dx = Math.cos(p.rot) * p.len * 0.5
            var dy = Math.sin(p.rot) * p.len * 0.5
            ctx.beginPath()
            ctx.moveTo(p.x - dx, p.y - dy)
            ctx.lineTo(p.x + dx, p.y + dy)
            ctx.strokeStyle = World.rgba(colour, 0.75 * fade)
            ctx.lineWidth = lw
            ctx.stroke()

        } else {
            // Sparks and embers are drawn as short streaks along their own
            // velocity rather than as dots. At these speeds a dot is a dot and
            // a streak is a spark.
            var f = 1 - t
            var speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
            var stretch = World.clamp(speed * 0.012, 0.15, 1.4)
            var ux = p.vx / (speed || 1) * stretch
            var uy = p.vy / (speed || 1) * stretch

            ctx.beginPath()
            ctx.moveTo(p.x - ux, p.y - uy)
            ctx.lineTo(p.x + ux, p.y + uy)
            ctx.strokeStyle = World.rgba(colour, 0.85 * f * f)
            ctx.lineWidth = lw * (p.size * 4)
            ctx.stroke()

            if (p.size > 0.4)
                Draw.glow(ctx, p.x, p.y, p.size * 6, colour, 0.25 * f)
        }
    }
}

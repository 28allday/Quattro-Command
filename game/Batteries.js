.import "World.js" as World
.import "Draw.js" as Draw

// Bravo, Kilo and Sierra -- three launchers on the floor below the horizon.
//
// The trucks are the original's drawing, transcribed: flatbed, cab leaning
// toward the middle of the screen, four wheels, a turret offset away from the
// cab, three angled tubes with warheads visible in them as long as there is
// ammunition to show, and the reserve rounds tucked under the chassis. It is a
// lot of line work for something eleven units tall and it is the reason the
// launchers read as vehicles rather than as icons.
//
// New here: the tubes flash when they fire, a dish sweeps on the turret while
// the battery is live, the last two rounds turn the alarm colour, and a
// destroyed battery burns instead of simply being redrawn as scrap.

// Callsigns, not the arcade's. The LÖVE original carried Atari's own three
// base names across verbatim and in the same order, which is a far more
// identifiable thing to have copied than any rule -- rules are not
// copyrightable and a specific set of three proper nouns is evidence. These
// keep the military texture and share nothing.
var DEFS = [
    { name: "BRAVO",  x: 18,  speed: 180, tilt:  0.35, dir:  1 },
    { name: "KILO",   x: 128, speed: 420, tilt:  0.00, dir:  1 },
    { name: "SIERRA", x: 238, speed: 180, tilt: -0.35, dir: -1 }
]

var AMMO_PER_WAVE = 10
var FLASH_TIME = 0.16
var BURN_TIME = 7.0

var batteries = []

function init() {
    batteries = []
    for (var i = 0; i < DEFS.length; i++) {
        batteries.push({
            index: i,
            name: DEFS[i].name,
            x: DEFS[i].x,
            y: World.GROUND_Y + 6,
            speed: DEFS[i].speed,
            tilt: DEFS[i].tilt,
            dir: DEFS[i].dir,
            ammo: AMMO_PER_WAVE,
            alive: true,
            flash: 0,
            burn: 0
        })
    }
}

function rearm() {
    for (var i = 0; i < batteries.length; i++) {
        batteries[i].ammo = AMMO_PER_WAVE
        batteries[i].alive = true
        batteries[i].burn = 0
        batteries[i].flash = 0
    }
}

function get(index) {
    return batteries[index]
}

function getAll() {
    return batteries
}

function totalAmmo() {
    var n = 0
    for (var i = 0; i < batteries.length; i++)
        if (batteries[i].alive) n += batteries[i].ammo
    return n
}

function fire(index) {
    var b = batteries[index]
    if (!b || !b.alive || b.ammo <= 0) return false
    b.ammo -= 1
    b.flash = FLASH_TIME
    return true
}

// Kilo first if it has anything left -- it is the fast one and the reason to
// aim with the mouse at all. Otherwise whichever flank is nearer the click.
function findNearest(gx) {
    var centre = batteries[1]
    if (centre && centre.alive && centre.ammo > 0) return centre

    var best = null, bestDist = Infinity
    var flanks = [0, 2]
    for (var i = 0; i < flanks.length; i++) {
        var b = batteries[flanks[i]]
        if (!b || !b.alive || b.ammo <= 0) continue
        var d = Math.abs(b.x - gx)
        if (d < bestDist) { bestDist = d; best = b }
    }
    return best
}

function destroy(index) {
    var b = batteries[index]
    if (!b || !b.alive) return false
    b.alive = false
    b.ammo = 0
    b.burn = BURN_TIME
    return true
}

function update(dt) {
    for (var i = 0; i < batteries.length; i++) {
        var b = batteries[i]
        if (b.flash > 0) b.flash = Math.max(0, b.flash - dt)
        if (b.burn > 0) b.burn = Math.max(0, b.burn - dt)
    }
}

function targets() {
    var list = []
    for (var i = 0; i < batteries.length; i++)
        if (batteries[i].alive)
            list.push({ x: batteries[i].x, y: batteries[i].y,
                        type: "battery", index: i })
    return list
}

// ----------------------------------------------------------------- drawing

function drawTruck(ctx, b, pal, lw, clock) {
    var x = b.x, y = b.y, dir = b.dir
    var body = pal.ground

    // Ground light under the vehicle, so it sits on the floor rather than
    // floating over the grid.
    Draw.glow(ctx, x, y + 1, 13, pal.glow, 0.10)

    // ---- flatbed
    Draw.glowPoly(ctx, [x-10,y-1.5, x+10,y-1.5, x+10,y, x-10,y, x-10,y-1.5],
                  body, lw, 1.2, 0.9)

    // ---- cab, leaning toward the middle of the screen
    var cabFront = x + dir * 10
    var cabBack = x + dir * 4
    Draw.glowPoly(ctx, [
        cabBack, y-1.5,
        cabBack, y-5,
        cabBack + dir*2, y-5.5,
        cabFront - dir*0.5, y-5.5,
        cabFront, y-3,
        cabFront, y-1.5
    ], body, lw, 1.2, 0.9)

    // Windscreen, and the headlight it looks through.
    Draw.glowSeg(ctx, cabFront - dir*0.3, y-3.2, cabFront - dir*1.6, y-5,
                 pal.bright, lw, 0.7, 0.55)
    Draw.glow(ctx, cabFront + dir * 0.6, y - 2.6, 5, pal.bright, 0.13)

    // ---- wheels
    var wheels = [-7, -3, 3, 7]
    for (var w = 0; w < wheels.length; w++) {
        ctx.beginPath()
        ctx.arc(x + wheels[w], y + 0.6, 1.3, 0, Math.PI * 2)
        Draw.strokeGlow(ctx, body, lw, 0.7, 0.85)
    }

    // ---- turret, mounted on the bed away from the cab
    var turretX = x - dir * 3
    Draw.glowPoly(ctx, [turretX-3,y-1.5, turretX-3,y-4, turretX+3,y-4, turretX+3,y-1.5],
                  body, lw, 1.0, 0.75)

    // A dish sweeping on top of it. Purely decorative, and the one thing on a
    // launcher that moves while you are not shooting -- which is what makes a
    // full battery look manned rather than parked.
    var sweep = Math.sin(clock * 1.3 + b.index * 2.1) * 0.9
    var dishX = turretX, dishY = y - 4.4
    Draw.glowSeg(ctx, dishX, dishY, dishX + Math.sin(sweep) * 2.2,
                 dishY - Math.cos(sweep) * 2.2, pal.abm, lw, 0.6, 0.5)

    // ---- three launch tubes, rotated about the turret top
    var pivotY = y - 4
    var tubeLen = 9
    var ca = Math.cos(b.tilt), sa = Math.sin(b.tilt)
    function rot(dx, dy) {
        return [turretX + dx * ca - dy * sa, pivotY + dx * sa + dy * ca]
    }

    for (var i = -1; i <= 1; i++) {
        var off = i * 2.2
        var a = rot(off - 0.8, 0),      bb = rot(off - 0.8, -tubeLen)
        var c = rot(off + 0.8, 0),      d  = rot(off + 0.8, -tubeLen)

        Draw.glowPoly(ctx, [a[0],a[1], bb[0],bb[1]], body, lw, 1.0, 0.9)
        Draw.glowPoly(ctx, [c[0],c[1], d[0],d[1]], body, lw, 1.0, 0.9)
        Draw.glowPoly(ctx, [bb[0],bb[1], d[0],d[1]], body, lw, 1.0, 0.9)

        // A warhead shows in a tube only while there is ammunition behind it,
        // so a battery visibly empties as you use it.
        if (b.ammo >= i + 2) {
            var low = b.ammo <= 2
            var round = low ? pal.alarm : pal.bright
            var n1 = rot(off, -0.5),            n2 = rot(off, -tubeLen + 1)
            var nl = rot(off - 0.7, -tubeLen + 1)
            var nr = rot(off + 0.7, -tubeLen + 1)
            var nt = rot(off, -tubeLen - 1.2)

            Draw.glowPoly(ctx, [n1[0],n1[1], n2[0],n2[1]], round, lw, 0.9, 0.95)
            Draw.glowPoly(ctx, [nl[0],nl[1], nt[0],nt[1], nr[0],nr[1], nl[0],nl[1]],
                          round, lw, 0.9, 0.95)
        }

        // Muzzle flash: a hot cone out of the tube mouth for a sixth of a
        // second after launch.
        if (b.flash > 0) {
            var f = b.flash / FLASH_TIME
            var m = rot(off, -tubeLen - 0.5)
            Draw.glow(ctx, m[0], m[1], 5 * f + 1.5, pal.core, 0.55 * f)
        }
    }

    // ---- reserve rounds under the chassis
    var reserve = Math.max(0, b.ammo - 3)
    for (var r = 0; r < reserve; r++) {
        var ax = x - 9 + (r % 7) * 2.6
        var ay = y - 0.8
        var col = b.ammo <= 2 ? pal.alarm : pal.bright
        Draw.glowPoly(ctx, [
            ax, ay, ax, ay-1.6,
            ax-0.4, ay-1.6, ax, ay-2.2, ax+0.4, ay-1.6, ax, ay-1.6
        ], col, lw, 0.55, 0.7)
    }

    // ---- status light
    var beacon = b.ammo === 0 ? pal.alarm : pal.bright
    var on = b.ammo === 0 ? (Math.sin(clock * 9) > 0)
                          : (Math.sin(clock * 4) > 0.3)
    if (on)
        Draw.spark(ctx, x + 8.5, y - 2.8, 0.5, beacon, 0.8)
}

function drawWreck(ctx, b, pal, lw, clock) {
    if (b.burn > 0) {
        var life = b.burn / BURN_TIME
        var flicker = 0.6 + Math.sin(clock * 13 + b.index * 2) * 0.4
        Draw.glow(ctx, b.x, b.y - 2, 14 * life + 3, pal.alarm, 0.26 * life * flicker)
        for (var s = 0; s < 3; s++) {
            var t = (clock * 0.4 + s * 0.33 + b.index) % 1
            Draw.glow(ctx, b.x + Math.sin(t * 6 + b.index) * (2 + t * 5),
                      b.y - 3 - t * 22, 3 + t * 6, pal.dim, 0.14 * (1 - t) * life)
        }
    }

    var x = b.x, y = b.y
    Draw.glowPoly(ctx, [x-11,y, x-9,y-3, x-7,y-2, x-5,y-4], pal.dim, lw, 0.7, 0.4)
    Draw.glowPoly(ctx, [x+5,y-3, x+7,y-1, x+9,y-3, x+11,y], pal.dim, lw, 0.7, 0.4)
    Draw.glowPoly(ctx, [x-12,y, x+12,y], pal.dim, lw, 0.7, 0.4)
    Draw.glowPoly(ctx, [x-4,y, x-3,y-3, x-1,y-1, x+1,y-4, x+3,y-2, x+4,y],
                  pal.dim, lw, 0.6, 0.28)
    // The launcher tube, bent and still pointing somewhere useless.
    Draw.glowPoly(ctx, [x-1,y-2, x+2,y-6, x+3,y-5.5], pal.dim, lw, 0.6, 0.28)
    Draw.glowPoly(ctx, [x,y-2, x+3,y-7], pal.dim, lw, 0.6, 0.28)
}

function draw(ctx, pal, lw, clock) {
    for (var i = 0; i < batteries.length; i++) {
        var b = batteries[i]
        if (b.alive) drawTruck(ctx, b, pal, lw, clock)
        else drawWreck(ctx, b, pal, lw, clock)
    }
}

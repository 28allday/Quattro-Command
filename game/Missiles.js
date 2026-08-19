.import "World.js" as World
.import "Waves.js" as Waves
.import "Draw.js" as Draw

// The incoming: plain warheads, MIRVs that split, and smart bombs that steer
// away from your explosions.
//
// Behaviour is the original's, including the parts that look like bugs and are
// not -- a warhead detonates when it has travelled its full distance *or* has
// fallen past its target's height, which is what stops a MIRV child aimed at a
// city that has since been flattened from burrowing into the floor.
//
// The module is deliberately ignorant of explosions, cities and batteries. It
// is handed a `world` object each frame with the two questions it needs
// answered -- is this point inside a fireball, and what is worth aiming at --
// and it reports back what happened. Game.qml is where those wires meet, which
// is the one structural rule that keeps any two of these modules from needing
// each other.

var active = []
var queue = []
var spawnTimer = 0

function makeMissile(def) {
    var dx = def.targetX - def.startX
    var dy = def.targetY - def.startY
    var dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 1) return null

    return {
        startX: def.startX, startY: def.startY,
        targetX: def.targetX, targetY: def.targetY,
        targetType: def.targetType,
        targetIndex: def.targetIndex,
        x: def.startX, y: def.startY,
        speed: def.speed,
        dirX: dx / dist, dirY: dy / dist,
        totalDist: dist,
        age: 0,
        emberTimer: 0,
        isMirv: def.isMirv || false,
        mirvSplit: false,
        mirvSplitFrac: def.mirvSplitFrac || 0,
        isSmart: def.isSmart || false,
        seed: Math.random() * Math.PI * 2
    }
}

function activate(def) {
    var m = makeMissile(def)
    if (m) active.push(m)
    return m
}

// Fill the queue for a wave. Nothing launches yet -- they trickle in on
// spawnInterval, which is what gives a wave its rhythm.
function spawnWave(wave, targets) {
    active = []
    queue = []

    var config = Waves.get(wave)
    // Primed so the first warhead is on its way almost immediately rather than
    // after a full interval of an empty sky.
    spawnTimer = config.spawnInterval - 0.3

    if (!targets || targets.length === 0) return

    var mirvChance = Waves.mirvChance(wave)
    var smartChance = Waves.smartBombChance(wave)

    for (var i = 0; i < config.missileCount; i++) {
        var target = targets[World.randInt(0, targets.length - 1)]

        var isMirv = false, isSmart = false
        // Mutually exclusive, and in this order: a warhead that both split and
        // dodged would be two mechanics deep before wave 5.
        if (Math.random() < mirvChance) isMirv = true
        else if (Math.random() < smartChance) isSmart = true

        queue.push({
            startX: World.randInt(10, 246),
            startY: World.randInt(0, World.SPAWN_BAND),
            targetX: target.x, targetY: target.y,
            targetType: target.type, targetIndex: target.index,
            speed: config.missileSpeed,
            isMirv: isMirv,
            isSmart: isSmart,
            mirvSplitFrac: isMirv ? (0.4 + Math.random() * 0.2) : 0
        })
    }
}

// A bomber or satellite dropping one on the way past.
function spawnFromFlier(x, y, wave, targets) {
    if (!targets || targets.length === 0) return null
    var target = targets[World.randInt(0, targets.length - 1)]
    return activate({
        startX: x, startY: y,
        targetX: target.x, targetY: target.y,
        targetType: target.type, targetIndex: target.index,
        speed: Waves.get(wave).missileSpeed
    })
}

function update(dt, world) {
    var config = Waves.get(world.wave)
    var events = {
        intercepted: [],   // shot down: [{x, y, points, isSmart}]
        impacts: [],       // reached a target: [{x, y, type, index}]
        splits: [],        // MIRV came apart here: [{x, y}]
        launched: 0
    }

    spawnTimer += dt
    if (queue.length > 0 && spawnTimer >= config.spawnInterval) {
        spawnTimer = 0
        if (activate(queue.shift()))
            events.launched += 1
    }

    var children = []

    for (var i = active.length - 1; i >= 0; i--) {
        var m = active[i]
        m.age += dt

        // ---- smart bombs push away from every nearby fireball
        if (m.isSmart) {
            var steerX = 0, steerY = 0
            var exps = world.explosions()
            for (var e = 0; e < exps.length; e++) {
                var edx = m.x - exps[e].x
                var edy = m.y - exps[e].y
                var d = Math.sqrt(edx * edx + edy * edy)
                if (d < 20 && d > 0.1) {
                    var strength = (20 - d) / 20
                    steerX += (edx / d) * strength * 40
                    steerY += (edy / d) * strength * 40
                }
            }
            var nx = m.dirX * m.speed + steerX
            var ny = m.dirY * m.speed + steerY
            var len = Math.sqrt(nx * nx + ny * ny)
            if (len > 0.1) { m.dirX = nx / len; m.dirY = ny / len }
        }

        var step = m.speed * dt
        m.x += m.dirX * step
        m.y += m.dirY * step

        var travelled = World.dist(m.startX, m.startY, m.x, m.y)

        // ---- MIRV split
        if (m.isMirv && !m.mirvSplit && travelled >= m.totalDist * m.mirvSplitFrac) {
            m.mirvSplit = true
            events.splits.push({ x: m.x, y: m.y })
            var targets = world.targets()
            if (targets.length > 0) {
                var n = World.randInt(2, 3)
                for (var c = 0; c < n; c++) {
                    var t = targets[World.randInt(0, targets.length - 1)]
                    children.push({
                        startX: m.x, startY: m.y,
                        targetX: t.x, targetY: t.y,
                        targetType: t.type, targetIndex: t.index,
                        speed: m.speed
                    })
                }
            }
        }

        // ---- shot down?
        if (world.hits(m.x, m.y)) {
            events.intercepted.push({
                x: m.x, y: m.y,
                points: m.isSmart ? 125 : 25,
                isSmart: m.isSmart
            })
            active.splice(i, 1)
            continue
        }

        // ---- arrived
        if (travelled >= m.totalDist || m.y >= m.targetY) {
            events.impacts.push({
                x: m.targetX, y: m.targetY,
                type: m.targetType, index: m.targetIndex
            })
            active.splice(i, 1)
        }
    }

    for (var k = 0; k < children.length; k++)
        activate(children[k])

    return events
}

function allDone() {
    return active.length === 0 && queue.length === 0
}

function count() { return active.length }
function queued() { return queue.length }
function getAll() { return active }
function clear() { active = []; queue = []; spawnTimer = 0 }

// Which warheads still have somewhere to be. Used by the crosshair's threat
// readout and by the cabinet to decide how tense the sky is.
function closestApproach() {
    var worst = Infinity
    for (var i = 0; i < active.length; i++)
        worst = Math.min(worst, World.GROUND_Y - active[i].y)
    return worst
}

// ----------------------------------------------------------------- drawing

function draw(ctx, pal, lw, clock) {
    for (var i = 0; i < active.length; i++) {
        var m = active[i]

        // A MIRV that has not split yet flies on twin exhausts. It is the only
        // warning you get, it is a fair one, and it costs one extra line.
        if (m.isMirv && !m.mirvSplit) {
            var px = -m.dirY * 0.7, py = m.dirX * 0.7
            Draw.trail(ctx, m.startX + px, m.startY + py, m.x + px, m.y + py,
                       pal.missile, lw, 0.55, 0.7)
            Draw.trail(ctx, m.startX - px, m.startY - py, m.x - px, m.y - py,
                       pal.missile, lw, 0.55, 0.7)
        } else {
            Draw.trail(ctx, m.startX, m.startY, m.x, m.y, pal.missile, lw, 0.85, 1)
        }

        var pulse = 0.6 + Math.sin(m.age * 20 + m.seed) * 0.4

        if (m.isSmart) {
            // A triangle that turns to face where it is going, with an eye
            // that sweeps -- it is looking for your fireballs, and it should
            // look like it.
            var a = Math.atan2(m.dirY, m.dirX) + Math.PI / 2
            var s = 2.2
            var ca = Math.cos(a), sa = Math.sin(a)
            var nose = [m.x - (-s) * sa, m.y + (-s) * ca]
            var left = [m.x + s * 0.87 * ca - s * 0.5 * sa,
                        m.y + s * 0.87 * sa + s * 0.5 * ca]
            var right = [m.x - s * 0.87 * ca - s * 0.5 * sa,
                         m.y - s * 0.87 * sa + s * 0.5 * ca]
            Draw.glow(ctx, m.x, m.y, 5, pal.missile, 0.30 * pulse)
            Draw.glowPoly(ctx, [nose[0],nose[1], left[0],left[1],
                                right[0],right[1], nose[0],nose[1]],
                          pal.core, lw, 1.1, pulse)
            var scan = Math.sin(clock * 5 + m.seed) * 0.9
            Draw.spark(ctx, m.x + Math.sin(scan) * 0.8, m.y + Math.cos(scan) * 0.8,
                       0.45, pal.alarm, 0.9)
        } else {
            // The original's pulsing wireframe diamond, with a hot head behind
            // it so the warhead is the brightest thing on its own trail.
            var s2 = 1.6
            Draw.glow(ctx, m.x, m.y, 4.5, pal.missile, 0.35 * pulse)
            Draw.glowPoly(ctx, [
                m.x, m.y - s2, m.x + s2, m.y, m.x, m.y + s2,
                m.x - s2, m.y, m.x, m.y - s2
            ], pal.core, lw, 1.1, pulse)
        }
    }
}

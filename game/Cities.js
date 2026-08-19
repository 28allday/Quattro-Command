.import "World.js" as World
.import "Draw.js" as Draw

// The six cities.
//
// The shape tables are the original's, vertex for vertex -- an office cluster,
// twin towers with a skybridge, a ziggurat, a gothic spire, an industrial
// complex and a domed civic building. They were drawn by hand in field units
// and there was no reason to touch them.
//
// What is new is everything around the outline. Each building now has a filled
// silhouette behind its wireframe so it has mass; a grid of lit windows placed
// inside that silhouette by a point-in-polygon test, blinking on their own
// phases; a reflection cast down onto the floor; and, once it is destroyed, a
// fire that burns down over the following seconds rather than a static pile of
// rubble appearing between one frame and the next.
//
// Every shape's outline starts and ends on y = 0, which is what makes the
// silhouette possible: closing the polyline gives the building's profile for
// free, and that same closed polygon is what the window placement tests
// against.

var SHAPES = [
    // 1: Office tower cluster -- tall centre, two flanking blocks
    {
        outline: [-7,0, -7,-6, -5,-6, -5,-8, -3,-8, -3,-4, -1,-4, -1,-14, 1,-14, 1,-4, 3,-4, 3,-7, 5,-7, 5,-10, 7,-10, 7,0],
        details: [
            [-1,-14, 0,-16, 1,-14],
            [-6,-2, -6,-5],
            [-5.5,-2, -5.5,-5],
            [0,-5, 0,-12],
            [6,-2, 6,-9],
            [5.5,-2, 5.5,-9]
        ]
    },
    // 2: Twin towers with skybridge
    {
        outline: [-7,0, -7,-12, -4,-12, -4,-4, -2,-4, -2,-11, 2,-11, 2,-4, 4,-4, 4,-13, 7,-13, 7,0],
        details: [
            [-4,-8, -2,-8],
            [-6,-3, -6,-11],
            [-5,-3, -5,-11],
            [5,-3, 5,-12],
            [6,-3, 6,-12],
            [4,-13, 5,-15, 6,-15, 7,-13]
        ]
    },
    // 3: Stepped pyramid / ziggurat
    {
        outline: [-8,0, -8,-4, -6,-4, -6,-7, -4,-7, -4,-10, -2,-10, -2,-13, 2,-13, 2,-10, 4,-10, 4,-7, 6,-7, 6,-4, 8,-4, 8,0],
        details: [
            [-1,-13, 0,-15, 1,-13],
            [-7,-1, -7,-3],
            [-5,-5, -5,-6],
            [-3,-8, -3,-9],
            [3,-8, 3,-9],
            [5,-5, 5,-6],
            [7,-1, 7,-3]
        ]
    },
    // 4: Gothic spire with flying buttresses
    {
        outline: [-6,0, -6,-5, -4,-5, -4,-8, -2,-8, -2,-11, -1,-14, 0,-17, 1,-14, 2,-11, 2,-8, 4,-8, 4,-5, 6,-5, 6,0],
        details: [
            [-6,-5, -4,-8],
            [6,-5, 4,-8],
            [-1,-8, -1,-11],
            [1,-8, 1,-11],
            [-0.5,-11, -0.5,-14],
            [0.5,-11, 0.5,-14],
            [-3,-3, -3,-7],
            [3,-3, 3,-7]
        ]
    },
    // 5: Industrial complex -- wide, boxy, with chimney
    {
        outline: [-8,0, -8,-6, -6,-6, -6,-8, -4,-8, -4,-6, -1,-6, -1,-10, 1,-10, 1,-6, 3,-6, 3,-5, 5,-5, 5,-8, 6,-8, 6,-12, 7,-12, 7,-5, 8,-5, 8,0],
        details: [
            [6,-12, 6.5,-14, 7,-12],
            [-7,-2, -7,-5],
            [-5,-2, -5,-5],
            [0,-7, 0,-9],
            [-3,-2, -3,-5],
            [4,-2, 4,-4]
        ]
    },
    // 6: Domed building with towers
    {
        outline: [-7,0, -7,-8, -6,-8, -6,-10, -5,-10, -5,-8, -3,-8, -3,-9, -2,-11, 0,-12, 2,-11, 3,-9, 3,-8, 5,-8, 5,-11, 6,-11, 6,-8, 7,-8, 7,0],
        details: [
            [-2,-11, 0,-12, 2,-11],
            [0,-12, 0,-14],
            [-6,-8, -6,-10],
            [5,-8, 5,-11],
            [-5.5,-10, -5.5,-10.5, -6.5,-10.5, -6.5,-10],
            [5,-11, 5,-11.5, 6,-11.5, 6,-11],
            [-2,-3, -2,-7],
            [2,-3, 2,-7]
        ]
    }
]

// Broken jagged debris. One profile serves every destroyed city, as before.
var RUBBLE = {
    outline: [-6,0, -5,-2, -4,-1, -3,-3, -1,-1, 0,-2.5, 1,-1, 3,-3, 4,-1.5, 5,-2, 6,0],
    details: [
        [-4,-1, -4.5,-3, -3,-2],
        [1,-1, 0.5,-3, 2,-2],
        [-2,-0.5, -1.5,-2],
        [3,-0.5, 3.5,-2.5]
    ]
}

var POSITIONS = [40, 68, 96, 160, 188, 216]

// How long a destroyed city keeps burning. Long enough to still be smoking
// when the wave tally comes up, which is the point: the tally is counting the
// ones that did not.
var BURN_TIME = 9.0

var cities = []
var destroyedThisWave = 0

// ------------------------------------------------------------- window grids

// Is a point inside the closed outline? Standard ray casting. The outline is
// closed by joining its last vertex back to its first, both of which sit on
// y = 0, so the polygon is the building's silhouette including its footprint.
function inShape(pts, x, y) {
    var inside = false
    var n = pts.length / 2
    for (var i = 0, j = n - 1; i < n; j = i++) {
        var xi = pts[i * 2], yi = pts[i * 2 + 1]
        var xj = pts[j * 2], yj = pts[j * 2 + 1]
        if (((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi))
            inside = !inside
    }
    return inside
}

// Lay a regular grid over the shape's bounding box and keep the cells that
// land inside it. A grid rather than scattered points because windows in rows
// read as a building and windows at random read as a swarm of fireflies.
function makeWindows(shape, seed) {
    var pts = shape.outline
    var minX = Infinity, maxX = -Infinity, minY = Infinity
    for (var i = 0; i < pts.length; i += 2) {
        if (pts[i] < minX) minX = pts[i]
        if (pts[i] > maxX) maxX = pts[i]
        if (pts[i + 1] < minY) minY = pts[i + 1]
    }

    var rnd = World.seeded(seed)
    var windows = []
    var stepX = 1.35, stepY = 1.7

    for (var x = minX + 0.9; x <= maxX - 0.5; x += stepX) {
        for (var y = -1.4; y >= minY + 1.2; y -= stepY) {
            // Inset the test so a window never straddles the outline it is
            // supposed to be behind.
            if (!inShape(pts, x, y)) continue
            if (!inShape(pts, x + 0.35, y) || !inShape(pts, x - 0.35, y)) continue
            if (rnd() < 0.32) continue          // a third of them are dark

            windows.push({
                x: x, y: y,
                w: 0.55, h: 0.75,
                // Most windows are simply on. The rest blink on their own
                // slow, unrelated cycles, which is what stops the building
                // reading as a lit sign.
                steady: rnd() < 0.62,
                phase: rnd() * Math.PI * 2,
                rate: 0.25 + rnd() * 0.7,
                bright: 0.45 + rnd() * 0.5
            })
        }
    }
    return windows
}

// ------------------------------------------------------------------- state

function init() {
    cities = []
    destroyedThisWave = 0
    for (var i = 0; i < 6; i++) {
        cities.push({
            index: i,
            x: POSITIONS[i],
            y: World.GROUND_Y,
            alive: true,
            burn: 0,                              // seconds of fire remaining
            shape: SHAPES[i],
            windows: makeWindows(SHAPES[i], 0xC17 + i * 7919)
        })
    }
}

function resetWaveCount() {
    destroyedThisWave = 0
}

function getAll() {
    return cities
}

// Returns true if the city actually fell. Three per wave is the cap, exactly
// as before -- past that the warhead lands and the city survives it.
function destroy(index) {
    var c = cities[index]
    if (!c || !c.alive) return false
    if (destroyedThisWave >= 3) return false
    c.alive = false
    c.burn = BURN_TIME
    destroyedThisWave += 1
    return true
}

function update(dt) {
    for (var i = 0; i < cities.length; i++)
        if (cities[i].burn > 0)
            cities[i].burn = Math.max(0, cities[i].burn - dt)
}

function allDestroyed() {
    for (var i = 0; i < cities.length; i++)
        if (cities[i].alive) return false
    return true
}

function aliveCount() {
    var n = 0
    for (var i = 0; i < cities.length; i++)
        if (cities[i].alive) n++
    return n
}

function destroyedCount() {
    return cities.length - aliveCount()
}

// Rebuild destroyed cities from the reserve. Returns how many went back up.
function deployBonus(available) {
    var deployed = 0
    for (var i = 0; i < cities.length && deployed < available; i++) {
        if (!cities[i].alive) {
            cities[i].alive = true
            cities[i].burn = 0
            deployed += 1
        }
    }
    return deployed
}

function targets() {
    var list = []
    for (var i = 0; i < cities.length; i++)
        if (cities[i].alive)
            list.push({ x: cities[i].x, y: cities[i].y, type: "city", index: i })
    return list
}

// ----------------------------------------------------------------- drawing

// A squashed, upside-down copy on the floor, fading out as it goes.
//
// The gradient is built after the flip, in the flipped space, so its stops run
// down the reflection rather than up the building.
function drawReflection(ctx, c, colour) {
    ctx.save()
    ctx.translate(c.x, World.GROUND_Y)
    ctx.scale(1, -0.34)

    var g = ctx.createLinearGradient(0, 0, 0, -17)
    g.addColorStop(0, World.rgba(colour, 0.20))
    g.addColorStop(1, World.rgba(colour, 0))

    Draw.polyPath(ctx, c.shape.outline, 0, 0)
    ctx.closePath()
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
}

function drawAlive(ctx, c, pal, lw, clock) {
    drawReflection(ctx, c, pal.cities)

    // Mass. Very low alpha -- enough that the building stops the stars behind
    // it, not so much that it stops reading as a wireframe.
    if (Draw.polyPath(ctx, c.shape.outline, c.x, c.y)) {
        ctx.closePath()
        ctx.fillStyle = World.rgba(World.mix(pal.sky, pal.cities, 0.22), 0.85)
        ctx.fill()
    }

    // Lit windows, behind the outline so the frame reads on top of them.
    for (var i = 0; i < c.windows.length; i++) {
        var w = c.windows[i]
        var lit = w.steady
                ? w.bright
                : (Math.sin(clock * w.rate + w.phase) > -0.1 ? w.bright : 0.06)
        if (lit < 0.1) continue
        var wx = c.x + w.x, wy = c.y + w.y
        Draw.glow(ctx, wx, wy, 1.6, pal.bright, lit * 0.22)
        ctx.fillStyle = World.rgba(pal.bright, lit * 0.75)
        ctx.fillRect(wx - w.w / 2, wy - w.h / 2, w.w, w.h)
    }

    // The outline itself, and then the interior detail at a lighter weight.
    Draw.glowPolyAt(ctx, c.shape.outline, c.x, c.y, pal.cities, lw, 1.4, 0.95)
    for (var d = 0; d < c.shape.details.length; d++)
        Draw.glowPolyAt(ctx, c.shape.details[d], c.x, c.y, pal.cities, lw, 0.7, 0.45)

    // Light spilling onto the ground at the base.
    var g = ctx.createLinearGradient(c.x - 11, 0, c.x + 11, 0)
    g.addColorStop(0.0, World.rgba(pal.glow, 0))
    g.addColorStop(0.5, World.rgba(pal.glow, 0.16))
    g.addColorStop(1.0, World.rgba(pal.glow, 0))
    ctx.fillStyle = g
    ctx.fillRect(c.x - 11, World.GROUND_Y - 1.2, 22, 2.4)
}

function drawRubble(ctx, c, pal, lw, clock) {
    // Fire, dying down over BURN_TIME. Drawn before the debris so the wreck is
    // silhouetted against its own flames.
    if (c.burn > 0) {
        var life = c.burn / BURN_TIME
        var flicker = 0.6 + Math.sin(clock * 11 + c.index) * 0.2
                          + Math.sin(clock * 27 + c.index * 3) * 0.2

        Draw.glow(ctx, c.x, c.y - 2, 13 * life + 4, pal.alarm,
                  0.30 * life * flicker)

        // Three tongues of flame on their own phases, leaning as they rise.
        for (var f = 0; f < 3; f++) {
            var fx = c.x - 3 + f * 3
            var sway = Math.sin(clock * (3.5 + f) + f * 2.1) * 1.4
            var h = (2.5 + f * 0.8) * life * flicker
            ctx.beginPath()
            ctx.moveTo(fx - 1, c.y)
            ctx.quadraticCurveTo(fx + sway * 0.4, c.y - h * 0.7,
                                 fx + sway, c.y - h)
            ctx.quadraticCurveTo(fx + sway * 0.4 + 1, c.y - h * 0.7,
                                 fx + 1, c.y)
            ctx.closePath()
            ctx.fillStyle = World.rgba(pal.alarm, 0.30 * life)
            ctx.fill()
        }

        // Smoke: a rising column that widens and fades. Outlives the flame.
        var smokeA = 0.16 * Math.min(1, life * 1.6)
        for (var s = 0; s < 4; s++) {
            var t = (clock * 0.35 + s * 0.25 + c.index) % 1
            var sy = c.y - 4 - t * 26
            var sx = c.x + Math.sin(t * 5 + c.index) * (2 + t * 5)
            Draw.glow(ctx, sx, sy, 3 + t * 7, pal.dim, smokeA * (1 - t))
        }
    }

    Draw.glowPolyAt(ctx, RUBBLE.outline, c.x, c.y, pal.dim, lw, 0.9, 0.5)
    for (var d = 0; d < RUBBLE.details.length; d++)
        Draw.glowPolyAt(ctx, RUBBLE.details[d], c.x, c.y, pal.dim, lw, 0.6, 0.28)
}

// Every window must be inside the outline it was placed in. Cheap to verify
// and worth verifying: the placement is a bounding-box grid filtered by a
// point-in-polygon test, and a single sign error there puts lights in the sky
// beside a building rather than in it.
function windowsInside() {
    for (var i = 0; i < cities.length; i++) {
        var c = cities[i]
        if (c.windows.length === 0) return false
        for (var w = 0; w < c.windows.length; w++)
            if (!inShape(c.shape.outline, c.windows[w].x, c.windows[w].y))
                return false
    }
    return true
}

function draw(ctx, pal, lw, clock) {
    for (var i = 0; i < cities.length; i++) {
        var c = cities[i]
        if (c.alive) drawAlive(ctx, c, pal, lw, clock)
        else drawRubble(ctx, c, pal, lw, clock)
    }
}

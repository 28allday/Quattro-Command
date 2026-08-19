.pragma library

.import "World.js" as World

// The house style, in one file.
//
// Every stroke in this game is drawn at least twice: a wide, nearly invisible
// halo underneath and a thin bright core on top. That is what a vector monitor
// does -- the beam blooms into the phosphor around wherever it dwells -- and
// doing it in the drawing rather than only in the bloom shader matters,
// because the shader blurs whatever it is given and a single hairline blurs
// into a smudge. Halo first gives the blur something with shape to work with.
//
// `lw` throughout is one device pixel expressed in field units, so a caller
// asking for `lw * 1.5` gets a line one and a half pixels wide at any cabinet
// size. Everything here takes it rather than assuming a scale.

// ------------------------------------------------------------------ paths

// Build a path from a flat [x,y, x,y, ...] array. The shape tables in
// Cities.js and Batteries.js are in exactly that form, straight out of the
// original's Lua, so nothing had to be rewritten to be drawn this way.
function polyPath(ctx, pts, ox, oy) {
    if (pts.length < 4) return false
    ctx.beginPath()
    ctx.moveTo(ox + pts[0], oy + pts[1])
    for (var i = 2; i < pts.length; i += 2)
        ctx.lineTo(ox + pts[i], oy + pts[i + 1])
    return true
}

// A polyline drawn as beam-in-phosphor: halo, body, core.
//
// `weight` scales all three together, so a structural outline (1.4) and an
// interior detail (0.8) keep the same relationship between glow and line.
function glowPoly(ctx, pts, colour, lw, weight, alpha) {
    if (!polyPath(ctx, pts, 0, 0)) return
    strokeGlow(ctx, colour, lw, weight, alpha)
}

function glowPolyAt(ctx, pts, ox, oy, colour, lw, weight, alpha) {
    if (!polyPath(ctx, pts, ox, oy)) return
    strokeGlow(ctx, colour, lw, weight, alpha)
}

// Stroke the current path three times. Kept separate so callers that built a
// path with arcs or curves can use the same treatment.
function strokeGlow(ctx, colour, lw, weight, alpha) {
    var w = weight === undefined ? 1 : weight
    var a = alpha === undefined ? 1 : alpha

    ctx.strokeStyle = World.rgba(colour, 0.10 * a)
    ctx.lineWidth = lw * w * 6
    ctx.stroke()

    ctx.strokeStyle = World.rgba(colour, 0.30 * a)
    ctx.lineWidth = lw * w * 2.6
    ctx.stroke()

    ctx.strokeStyle = World.rgba(colour, 0.95 * a)
    ctx.lineWidth = lw * w
    ctx.stroke()
}

// One segment, same treatment. The common case, and worth not building an
// array for.
function glowSeg(ctx, x1, y1, x2, y2, colour, lw, weight, alpha) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    strokeGlow(ctx, colour, lw, weight, alpha)
}

// ------------------------------------------------------------------ trails

// A missile trail that fades from nothing at the launch point to a hot line at
// the head.
//
// The original drew one flat-alpha line from start to current position, which
// is legible but reads as a wire rather than as something burning its way
// across the sky. A gradient costs one extra object per missile and is the
// single biggest difference in how the field looks in motion.
function trail(ctx, x1, y1, x2, y2, colour, lw, headAlpha, weight) {
    var w = weight === undefined ? 1 : weight
    var a = headAlpha === undefined ? 0.9 : headAlpha

    // Zero-length gradients are undefined behaviour in some canvas backends,
    // and a missile is exactly at its start point on its first frame.
    if (Math.abs(x2 - x1) < 0.001 && Math.abs(y2 - y1) < 0.001)
        return

    var g = ctx.createLinearGradient(x1, y1, x2, y2)
    g.addColorStop(0.0, World.rgba(colour, 0))
    g.addColorStop(0.45, World.rgba(colour, a * 0.25))
    g.addColorStop(1.0, World.rgba(colour, a))

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)

    // Halo takes the same gradient at a fraction of the alpha, so the glow
    // fades out along with the line instead of hanging behind it.
    var gh = ctx.createLinearGradient(x1, y1, x2, y2)
    gh.addColorStop(0.0, World.rgba(colour, 0))
    gh.addColorStop(1.0, World.rgba(colour, a * 0.16))

    ctx.strokeStyle = gh
    ctx.lineWidth = lw * w * 5
    ctx.stroke()

    ctx.strokeStyle = g
    ctx.lineWidth = lw * w * 1.5
    ctx.stroke()
}

// ------------------------------------------------------------- light blobs

// A soft radial glow. The building block for warhead heads, explosion cores,
// window light and the haze over the horizon.
function glow(ctx, x, y, radius, colour, alpha) {
    if (radius <= 0) return
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius)
    g.addColorStop(0.0, World.rgba(colour, alpha))
    g.addColorStop(0.4, World.rgba(colour, alpha * 0.35))
    g.addColorStop(1.0, World.rgba(colour, 0))
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
}

// The fireball: white-hot centre, theme colour body, nothing at the rim.
//
// Deliberately has NO outline. The arcade original drew a flat filled circle,
// which meant two fireballs that touched merged into one continuous mass --
// and that merging is most of what a chain reaction looks like. Any stroke
// round the edge destroys it: two outlined discs that overlap read as two
// discs, however well they are drawn.
//
// So the body is carried almost to full alpha before it falls away, because
// two overlapping regions of the same colour at the same alpha composite into
// one flat region with no seam, while two at 60% show their overlap as a
// bright lens. The soft last fifteen percent is what keeps it from being a
// hard-edged disc.
function fireballFill(ctx, x, y, radius, core, body, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius)
    // The core is a highlight, not a filling. Giving it a third of the radius
    // -- which the first version did -- means the body colour never gets a
    // chance to show before the bloom pass turns the whole disc white.
    g.addColorStop(0.00, World.rgba(core, alpha))
    g.addColorStop(0.16, World.rgba(body, alpha))
    g.addColorStop(0.84, World.rgba(body, alpha))
    g.addColorStop(1.00, World.rgba(body, 0))
    ctx.fillStyle = g
    ctx.fill()
}

// A fireball whose edge boils.
//
// The silhouette is the plasma path rather than a circle -- the arcade drew
// perfect circles because that is what the hardware could do, and an explosion
// is not a circle -- but it is a FILL, not a stroke, so there is still no line
// anywhere and two of them that touch still merge.
function fireball(ctx, x, y, radius, core, body, alpha, clock, seed) {
    if (radius <= 0) return
    plasmaPath(ctx, x, y, radius, clock, 0.07, seed)
    fireballFill(ctx, x, y, radius, core, body, alpha)
}

// A closed path whose radius boils. Used as the fireball's fill shape.
//
// Sixteen vertices with a time-varying radius is enough to break a circle
// without it reading as a polygon -- and because the wobble is a function of
// the clock rather than of random(), it moves smoothly instead of hissing.
function plasmaPath(ctx, x, y, radius, clock, amount, seed) {
    var n = 16
    ctx.beginPath()
    for (var i = 0; i <= n; i++) {
        var a = (i % n) / n * Math.PI * 2
        var wobble = 1 + Math.sin(a * 3 + clock * 9 + seed) * amount
                       + Math.sin(a * 7 - clock * 6 + seed * 1.7) * amount * 0.5
        var r = radius * wobble
        var px = x + Math.cos(a) * r
        var py = y + Math.sin(a) * r
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py)
    }
    ctx.closePath()
}

// A filled dot with a halo. Warhead heads, nav lights, lit windows.
function spark(ctx, x, y, radius, colour, alpha) {
    glow(ctx, x, y, radius * 4, colour, alpha * 0.5)
    ctx.fillStyle = World.rgba(colour, alpha)
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
}

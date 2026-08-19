.pragma library

// The field, and the arithmetic everything else shares.
//
// A library module: one copy, no state. Every mutable module in game/ imports
// this and nothing else mutable, which is what keeps them independent enough
// for Game.qml to be the only place two of them meet.
//
// The coordinate space is the original's, unchanged: 256 units wide, 231 tall,
// ground at 213. Every shape in Cities.js and Batteries.js is authored in
// those units, so keeping them is what makes this a port rather than a redraw.
// What changed is that the canvas underneath is now rendered at four times
// that and scaled, so a "1 unit" line is several device pixels of glowing
// phosphor rather than one hard pixel.

var GAME_W = 256
var GAME_H = 231
var GROUND_Y = 213

// Sky occupies everything above the ground line. Missiles enter in the top
// five units of it.
var SPAWN_BAND = 5

function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v)
}

function lerp(a, b, t) {
    return a + (b - a) * t
}

function dist(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1
    return Math.sqrt(dx * dx + dy * dy)
}

function randRange(lo, hi) {
    return lo + Math.random() * (hi - lo)
}

function randInt(lo, hi) {
    return Math.floor(lo + Math.random() * (hi - lo + 1))
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)]
}

// A deterministic generator, for anything that must look hand-placed but come
// out the same every launch -- the starfield, the ridgeline, each city's
// window grid. Math.random() would reshuffle the sky on every repaint of a
// canvas that is otherwise painted once.
function seeded(seed) {
    var s = seed >>> 0
    return function () {
        // xorshift32. Small, fast, and good enough for scattering dots.
        s ^= s << 13; s >>>= 0
        s ^= s >> 17
        s ^= s << 5;  s >>>= 0
        return s / 4294967296
    }
}

// ------------------------------------------------------------------- colour

// Canvas wants "rgba(r,g,b,a)" strings. QML colors arrive as objects with
// 0..1 components, so everything that draws goes through here.
function rgba(c, alpha) {
    return "rgba(" + Math.round(c.r * 255) + ","
                   + Math.round(c.g * 255) + ","
                   + Math.round(c.b * 255) + ","
                   + (alpha === undefined ? 1 : alpha) + ")"
}

// Blend two QML colors. Used for the horizon haze and the ridgeline, both of
// which are the background nudged a little way toward something warmer.
function mix(a, b, t) {
    return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t
    }
}

// Push a colour toward white. The core of an explosion and the head of a
// warhead are hotter than any colour in the theme, and this is how they get
// there without hard-coding white and losing the tint.
function hot(c, t) {
    return mix(c, { r: 1, g: 1, b: 1 }, t)
}

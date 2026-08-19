.pragma library

.import "World.js" as World

// Which theme colour plays which part, and how that rotates as the waves go by.
//
// The original read the active theme's ghostty.conf at startup and mapped the
// sixteen ANSI colours onto game roles, shifting the mapping every two waves
// so wave 5 does not look like wave 1. That behaviour is kept whole -- it is
// the game's one real visual signature. What changed is where the colours come
// from: the cabinet hands them in live, so a theme switch recolours the game
// mid-wave instead of needing a relaunch.
//
// `theme` is { bg, fg, accent, dim, colors: [16 colours] }. Every field is a
// QML color, which is an object of 0..1 components -- see World.rgba.

var SHIFT_EVERY = 2      // waves per palette rotation
var VARIANTS = 5

// Which ANSI slot leads each rotation. The primaries are the cool half of the
// palette (blue, magenta, cyan, bright red, bright green) because they read as
// friendly hardware; the enemy colours are the hot half.
var PRIMARY_SLOTS = [4, 5, 6, 9, 10]
var ENEMY_SLOTS   = [1, 2, 3, 9, 1]

function shiftFor(wave) {
    return (Math.ceil(wave / SHIFT_EVERY) - 1) % VARIANTS
}

function get(theme, wave) {
    var shift = shiftFor(wave)
    var c = theme.colors

    var primary = c[PRIMARY_SLOTS[shift]]
    var enemy = c[ENEMY_SLOTS[shift]]

    return {
        // ---- the original's roles, unchanged in intent
        sky:       theme.bg,
        ground:    primary,
        missile:   enemy,
        abm:       c[6],
        cities:    primary,
        // Explosions cycle through three hot colours rather than flashing
        // between two. The original used the accent and color4, which on a
        // theme where the cursor colour *is* color4 -- and there are plenty --
        // meant it flashed between one colour and itself and never flashed at
        // all.
        exp1:      theme.accent,
        exp2:      c[9],
        exp3:      c[3],
        crosshair: theme.accent,
        dim:       theme.dim,
        bright:    theme.accent,
        fg:        theme.fg,
        // The floor grid in the primary rather than color0. The original used
        // color0, which on every dark theme *is* the background -- the grid was
        // drawn every frame and had never once been visible.
        grid:      primary,
        glow:      c[4],

        // ---- roles the vector-and-glow rewrite added
        //
        // The backdrop is new, so these are new. All three are the background
        // nudged a short way toward something else rather than free colours:
        // a sky that competes with the play field for attention is a sky that
        // has to be turned off again.
        haze:      World.mix(theme.bg, primary, 0.22),   // horizon glow
        ridgeFar:  World.mix(theme.bg, primary, 0.15),   // distant hills
        ridgeNear: World.mix(theme.bg, primary, 0.27),   // nearer hills
        star:      theme.fg,
        // The hot core of an explosion and the head of a warhead. Deliberately
        // NOT white, and only a third of the way toward it: at two thirds the
        // fireballs came out of the bloom pass as featureless white blobs with
        // the theme nowhere in them, which is the one thing this game is not
        // allowed to look like.
        core:      World.hot(theme.accent, 0.32),
        // Warning colour: low ammo, a killer satellite's eye, the last city.
        alarm:     c[9]
    }
}

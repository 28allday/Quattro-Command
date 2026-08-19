.pragma library

// The difficulty ramp, transcribed from the original's data/waves.lua.
//
// These numbers were tuned by playing, not derived, so they are copied rather
// than re-derived: waves 1-3 learnable, real pressure around 6-8, brutal past
// 15. Nothing here is new.

function get(wave) {
    // Missiles: gentle ramp, roughly one more per wave, capped at 26.
    var missileCount = Math.min(7 + wave, 26)

    // Speed: very slow early, then two steeper segments, capped at 50.
    var missileSpeed
    if (wave <= 4)
        missileSpeed = 6 + wave * 1.5              // 7.5, 9, 10.5, 12
    else if (wave <= 10)
        missileSpeed = 12 + (wave - 4) * 2.5       // 14.5 .. 27
    else if (wave <= 18)
        missileSpeed = 27 + (wave - 10) * 2.8      // 29.8 .. 49.4
    else
        missileSpeed = 50

    // Spawn interval: generous early, tighter later, floored at half a second.
    var spawnInterval
    if (wave <= 4)
        spawnInterval = 2.2 - wave * 0.12          // 2.08 .. 1.72
    else if (wave <= 10)
        spawnInterval = 1.7 - (wave - 4) * 0.12    // 1.58 .. 0.98
    else
        spawnInterval = Math.max(1.0 - (wave - 10) * 0.04, 0.5)

    var multiplier
    if (wave <= 2)       multiplier = 1
    else if (wave <= 4)  multiplier = 2
    else if (wave <= 6)  multiplier = 3
    else if (wave <= 8)  multiplier = 4
    else if (wave <= 10) multiplier = 5
    else                 multiplier = 6

    return {
        missileCount: missileCount,
        missileSpeed: missileSpeed,
        spawnInterval: spawnInterval,
        multiplier: multiplier
    }
}

// A warhead that splits into two or three on the way down. None before wave 3.
function mirvChance(wave) {
    if (wave <= 2) return 0
    if (wave <= 4) return 0.2
    return Math.min(0.3 + (wave - 5) * 0.02, 0.4)
}

// A warhead that steers away from your explosions. None before wave 5.
function smartBombChance(wave) {
    if (wave <= 4) return 0
    if (wave <= 6) return 0.15
    return 0.25
}

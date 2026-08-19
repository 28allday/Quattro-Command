import QtQuick
import "World.js" as World
import "Waves.js" as Waves
import "Palette.js" as Palette
import "Draw.js" as Draw
import "Backdrop.js" as Backdrop
import "Cities.js" as Cities
import "Batteries.js" as Batteries
import "Abm.js" as Abm
import "Missiles.js" as Missiles
import "Fliers.js" as Fliers
import "Explosions.js" as Explosions
import "Particles.js" as Particles
import "Crosshair.js" as Crosshair

// Quattro Command -- the cabinet's contents.
//
// Free of Quickshell imports on purpose: this file plus game/*.js is a plain
// QtQuick component that runs in any QML window, which is what makes the feel
// tunable without restarting a shell. Panel.qml adds the parts that genuinely
// need one -- a window, keyboard focus, the live theme, and the score table on
// disk.
//
// Four structural rules, the same ones the last port settled on:
//
//   * The mutable JS modules are imported HERE AND NOWHERE ELSE. A .js without
//     `.pragma library` gets a fresh copy per importing document, so a second
//     importer would silently get a second, empty game. World/Waves/Palette/
//     Draw/Backdrop are libraries, which is safe precisely because they hold
//     no state.
//   * No module imports another mutable module. Missiles does not know what a
//     City is; it is handed a list of targets and a function that answers
//     "is this point inside a fireball", and it reports back what happened.
//     Every wire between two of them is in this file.
//   * Run state is QML properties here, not fields in a JS module, so the HUD
//     is a set of bindings rather than something redrawn by hand.
//   * Property names cannot begin with a capital letter in QML. The Lua's
//     GROUND_Y convention does not survive the crossing.
Item {
    id: game

    focus: true

    // ------------------------------------------------------------ interface

    // [{initials: "AAA", score: 1234}, ...], highest first. Seeded from disk
    // by the host and emitted back on every change.
    property var scores: []
    signal scoresUpdated(var list)
    signal quitRequested()

    // Owned by the host: the game asks, the host decides and stores it.
    // Toggling an incoming binding from in here would break the binding and
    // quietly stop the setting persisting.
    property bool soundEnabled: true
    signal soundToggleRequested()
    property bool crtEnabled: true
    signal crtToggleRequested()

    property string fontFamily: "monospace"

    // ---- theme
    //
    // The original read the active theme's ghostty.conf once at startup and
    // needed a relaunch to follow a theme change. The cabinet hands these in
    // live instead, so switching desktop theme recolours the game mid-wave.
    // Defaults are a plain terminal palette so the game stands up on its own
    // in a bare QML window.
    property color colBackground: "#101315"
    property color colForeground: "#cacccc"
    property color colAccent:     "#e0af68"
    property color colDim:        "#3b4048"
    property var ansi: [
        "#15161e", "#f7768e", "#9ece6a", "#e0af68",
        "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
        "#414868", "#ff9e64", "#73daca", "#c0caf5",
        "#2ac3de", "#ff007c", "#b4f9f8", "#c0caf5"
    ]

    // Normalised once here rather than per draw call. `ansi` is allowed to
    // arrive as hex strings, which is what makes the defaults above readable
    // and what a hand-written override would naturally be -- but the drawing
    // code reads .r/.g/.b off every colour it is given, and a string has none
    // of those. It produced "rgba(NaN,NaN,NaN,1)", which canvas discards in
    // silence: no exception, no warning, just a field that never drew anything
    // while the QML text on top of it rendered perfectly.
    readonly property var theme: ({
        bg: game.colBackground,
        fg: game.colForeground,
        accent: game.colAccent,
        dim: game.colDim,
        colors: game.ansi.map(function (c) {
            return (typeof c === "string") ? Qt.color(c) : c
        })
    })

    // Every draw call takes this. Rebuilding it per wave rather than per frame
    // is deliberate -- it is the thing the palette rotation changes.
    readonly property var pal: Palette.get(game.theme, game.wave)

    // ------------------------------------------------------------ run state

    property string phase: "title"   // title | playing | tally | gameOver | entry

    property int score: 0
    property int wave: 1
    property int bonusCities: 0
    property int nextBonusAt: 10000
    property real gameOverTimer: 0
    property real clock: 0           // seconds since load; drives every pulse

    readonly property int highScore: game.scores.length > 0 ? game.scores[0].score : 0
    readonly property int waveMultiplier: Waves.get(game.wave).multiplier
    // Bumped once per painted frame. The canvases are painted from JS that QML
    // cannot see into, so anything the HUD needs to know about has to be
    // mirrored out here -- and this counter is what gives such a binding a
    // dependency to be invalidated by.
    property int tick: 0

    // Note the comma: `tick` is read purely so that this binding has something
    // QML can watch. Without it these are bindings on a function call with no
    // QML dependency at all -- evaluated exactly once, at creation, which is
    // BEFORE Component.onCompleted has run Cities.init(), and never again. The
    // first build read six cities as zero for the whole game and the HUD never
    // noticed a city falling. Anything else here that reads through a JS
    // module needs the same treatment.
    readonly property int citiesLeft: (game.tick, Cities.aliveCount())
    readonly property int ammoLeft: (game.tick, Batteries.totalAmmo())

    // ---- screen shake
    //
    // Impacts only, never interceptions: shaking the cabinet when you succeed
    // makes success feel like a mistake.
    property real shake: 0
    readonly property real shakeX: game.shake > 0
        ? Math.sin(game.clock * 61) * game.shake : 0
    readonly property real shakeY: game.shake > 0
        ? Math.sin(game.clock * 47 + 1.7) * game.shake * 0.7 : 0

    function kick(amount) {
        game.shake = Math.min(6, game.shake + amount)
    }

    // ---------------------------------------------------------- the tally

    // The between-waves count-up. Its own little state machine, exactly as in
    // the original: unused rounds first, then surviving cities, then any bonus
    // city, then a beat before the next wave starts.
    property string tallyPhase: "none"      // missiles | cities | bonus | done
    property real tallyTimer: 0
    property int tallyMissilesLeft: 0
    property int tallyMissilesCounted: 0
    property int tallyCitiesLeft: 0
    property int tallyCitiesCounted: 0
    property int tallyMultiplier: 1
    property bool tallyBonusEarned: false
    property int tallyRebuilt: 0
    property real tallyDone: 0

    readonly property real tickInterval: 0.12
    readonly property real donePause: 1.4

    // ---------------------------------------------------------------- input

    onActiveFocusChanged: if (!activeFocus) game.shake = 0

    Keys.onPressed: function (e) {
        // Auto-repeat must not reach anything below: every key here is an
        // edge, and a held key would otherwise fire at the keyboard's repeat
        // rate rather than at the game's.
        if (e.isAutoRepeat) { e.accepted = true; return }
        e.accepted = true

        // The tube toggle and the mute both work in every phase except
        // initials entry, where M is a letter someone is trying to type.
        if (e.key === Qt.Key_F1) { game.crtToggleRequested(); return }
        if (e.key === Qt.Key_M && game.phase !== "entry") {
            game.soundToggleRequested(); return
        }

        switch (game.phase) {
        case "title":
            if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter) game.startGame()
            else if (e.key === Qt.Key_Escape) game.quitRequested()
            else e.accepted = false
            return

        case "playing":
            if (e.key === Qt.Key_A || e.key === Qt.Key_1) game.fireFrom(0)
            else if (e.key === Qt.Key_S || e.key === Qt.Key_2) game.fireFrom(1)
            else if (e.key === Qt.Key_D || e.key === Qt.Key_3) game.fireFrom(2)
            else if (e.key === Qt.Key_Escape) game.quitRequested()
            else e.accepted = false
            return

        case "tally":
            e.accepted = false
            return

        case "gameOver":
            if ((e.key === Qt.Key_Return || e.key === Qt.Key_Enter)
                    && game.gameOverTimer > 2.0) game.finishRun()
            else if (e.key === Qt.Key_Escape) game.quitRequested()
            else e.accepted = false
            return

        case "entry":
            game.entryKey(e)
            return
        }
    }

    // ------------------------------------------------------------ lifecycle

    function resetTitle() {
        game.phase = "title"
        game.wave = 1
        Explosions.clear()
        Abm.clear()
        Missiles.clear()
        Fliers.clear()
        Particles.clear()
        Crosshair.clear()
        Cities.init()
        Batteries.init()
        sound.stopAll()
        game.repaintBackdrop()
        game.refresh()
    }

    function startGame() {
        game.phase = "playing"
        game.wave = 1
        game.score = 0
        game.bonusCities = 0
        game.nextBonusAt = 10000
        game.gameOverTimer = 0
        game.shake = 0

        Cities.init()
        Batteries.init()
        Explosions.clear()
        Abm.clear()
        Fliers.init()
        Particles.clear()
        Crosshair.clear()
        Cities.resetWaveCount()
        Missiles.spawnWave(1, game.allTargets())

        sound.play("wave_start")
        game.repaintBackdrop()
        game.refresh()
    }

    function startNextWave() {
        game.wave += 1
        Batteries.rearm()
        Explosions.clear()
        Abm.clear()
        Fliers.clear()
        Particles.clear()
        Crosshair.clear()
        Cities.resetWaveCount()
        Missiles.spawnWave(game.wave, game.allTargets())
        game.phase = "playing"
        sound.play("wave_start")
        // The palette rotates every two waves, and the backdrop is painted in
        // it, so the sky has to be repainted when it turns over.
        game.repaintBackdrop()
        game.refresh()
    }

    function endRun() {
        game.phase = "gameOver"
        game.gameOverTimer = 0
        sound.stopLoop("flier_hum")
        sound.play("game_over")
        Explosions.clear()
        Abm.clear()
        Missiles.clear()
        Fliers.clear()
        game.refresh()
    }

    function finishRun() {
        if (game.qualifies(game.score)) {
            game.entryLetters = ["A", "A", "A"]
            game.entryPosition = 0
            game.entryBlink = 0
            game.phase = "entry"
        } else {
            game.resetTitle()
        }
    }

    // -------------------------------------------------------------- scoring

    // Points earned in play carry the wave multiplier. The tally's own awards
    // do not -- it applies the multiplier itself, as it announces it.
    function addScore(points) {
        game.addRaw(points * Waves.get(game.wave).multiplier)
    }

    function addRaw(points) {
        game.score += points
        while (game.score >= game.nextBonusAt) {
            game.bonusCities += 1
            game.nextBonusAt += 10000
            sound.play("bonus_city")
        }
    }

    // -------------------------------------------------------------- firing

    function allTargets() {
        return Cities.targets().concat(Batteries.targets())
    }

    function launch(bat, tx, ty) {
        if (!bat || Abm.full()) return false
        if (!Batteries.fire(bat.index)) return false
        Abm.fire(bat.x, bat.y, tx, ty, bat.speed)
        Crosshair.addMarker(tx, ty)
        // A puff of exhaust at the tube mouth, thrown back down the way a
        // launch actually looks.
        Particles.burst(bat.x, bat.y - 8, 7, 26, "abm", Math.PI * 0.5, 1.6)
        sound.play("launch")
        game.refresh()
        return true
    }

    // Keyboard: fire the named battery at wherever the reticle is.
    function fireFrom(index) {
        var bat = Batteries.get(index)
        if (!bat || !bat.alive || bat.ammo <= 0) return
        var p = Crosshair.position()
        game.launch(bat, p.x, p.y)
    }

    // Mouse: fire whichever battery is best placed for the click.
    function fireAt(gx, gy) {
        game.launch(Batteries.findNearest(gx), gx, gy)
    }

    // ------------------------------------------------------- the score table

    readonly property int maxScores: 10

    function qualifies(value) {
        if (value <= 0) return false
        if (game.scores.length < game.maxScores) return true
        return value > game.scores[game.scores.length - 1].score
    }

    function recordScore(initials, value) {
        var list = game.scores.slice()
        list.push({ initials: initials.toUpperCase(), score: value })
        list.sort(function (a, b) { return b.score - a.score })
        while (list.length > game.maxScores) list.pop()
        game.scores = list
        game.scoresUpdated(list)
    }

    property var entryLetters: ["A", "A", "A"]
    property int entryPosition: 0
    property real entryBlink: 0

    function entryKey(e) {
        var letters = game.entryLetters.slice()
        if (e.key === Qt.Key_Left) {
            game.entryPosition = Math.max(0, game.entryPosition - 1)
        } else if (e.key === Qt.Key_Right) {
            game.entryPosition = Math.min(2, game.entryPosition + 1)
        } else if (e.key === Qt.Key_Up || e.key === Qt.Key_Down) {
            var step = e.key === Qt.Key_Up ? 1 : -1
            var code = letters[game.entryPosition].charCodeAt(0) + step
            if (code > 90) code = 65
            if (code < 65) code = 90
            letters[game.entryPosition] = String.fromCharCode(code)
            game.entryLetters = letters
        } else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter
                   || e.key === Qt.Key_Escape) {
            game.recordScore(letters.join(""), game.score)
            game.resetTitle()
        } else if (e.key >= Qt.Key_A && e.key <= Qt.Key_Z) {
            // Typing is faster than nudging, and advances -- three keystrokes
            // and Enter is the whole interaction.
            letters[game.entryPosition] = String.fromCharCode(e.key)
            game.entryLetters = letters
            if (game.entryPosition < 2) game.entryPosition += 1
        }
        e.accepted = true
    }

    // ------------------------------------------------------------ inspection

    // The mutable modules are reachable from this file alone, so a headless
    // harness cannot touch them directly. These hand out the live objects: a
    // harness reads and moves them to set a scenario up, then drives the real
    // step().
    function peek() {
        return {
            missiles: Missiles.getAll(),
            abms: Abm.getAll(),
            fliers: Fliers.getAll(),
            explosions: Explosions.getAll(),
            cities: Cities.getAll(),
            batteries: Batteries.getAll(),
            particles: Particles.count(),
            queued: Missiles.queued()
        }
    }

    function debugDetonate(x, y) { return game.detonate(x, y) }
    function debugClearSky() { Missiles.clear() }
    function debugDestroyCity(i) { var r = Cities.destroy(i); game.refresh(); return r }
    function debugResetWaveCount() { Cities.resetWaveCount(); game.refresh() }
    function debugSkySignature() { return Backdrop.signature() }
    function debugWindowsInside() { return Cities.windowsInside() }

    // The wave table and the palette rotation are pure functions of the wave
    // number, so they are checkable without playing anything -- but the
    // library modules holding them are not reachable from outside this file.
    function mirvChanceAt(w) { return Waves.mirvChance(w) }
    function smartChanceAt(w) { return Waves.smartBombChance(w) }
    function paletteShiftAt(w) { return Palette.shiftFor(w) }

    // ----------------------------------------------------------- the loop

    // Off in the headless harness, which drives step() itself at a fixed dt so
    // a test is not at the mercy of the frame rate.
    property bool autoRun: true

    FrameAnimation {
        running: game.visible && game.autoRun
        // Clamped: a frame the compositor sat on for half a second must not
        // teleport every warhead through the fireball meant to stop it.
        onTriggered: game.step(Math.min(frameTime, 0.05))
    }

    // The two questions the independent modules are allowed to ask about the
    // rest of the world, bundled once rather than rebuilt per module per frame.
    readonly property var worldView: ({
        wave: 0,
        hits: function (x, y) { return Explosions.hits(x, y) },
        explosions: function () { return Explosions.getAll() },
        targets: function () { return game.allTargets() }
    })

    function detonate(x, y) {
        var e = Explosions.add(x, y)
        if (!e) return null
        sound.play("explosion")
        Particles.burst(x, y, 14, 55, "core")
        Particles.smoke(x, y, 3, "dim")
        return e
    }

    function step(dt) {
        game.clock += dt
        game.refresh()

        if (game.shake > 0)
            game.shake = Math.max(0, game.shake - dt * 14)

        if (game.phase === "title") {
            // The attract screen runs the particle system and nothing else, so
            // the sky is still and the name is the only thing on it.
            Particles.update(dt)
            game.paint()
            return
        }

        if (game.phase === "gameOver") {
            game.gameOverTimer += dt
            Explosions.update(dt)
            Particles.update(dt)
            Cities.update(dt)
            Batteries.update(dt)
            game.paint()
            return
        }

        if (game.phase === "entry") {
            game.entryBlink += dt
            Particles.update(dt)
            Cities.update(dt)
            game.paint()
            return
        }

        if (game.phase === "tally") {
            game.stepTally(dt)
            Explosions.update(dt)
            Particles.update(dt)
            Cities.update(dt)
            Batteries.update(dt)
            game.paint()
            return
        }

        // ---------------------------------------------------------- playing
        game.worldView.wave = game.wave

        Cities.update(dt)
        Batteries.update(dt)
        Crosshair.update(dt)
        Explosions.update(dt)
        Particles.update(dt)

        // ---- player missiles arriving
        var arrivals = Abm.update(dt)
        for (var a = 0; a < arrivals.length; a++) {
            Crosshair.removeMarker(arrivals[a].x, arrivals[a].y)
            game.detonate(arrivals[a].x, arrivals[a].y)
        }

        // ---- the incoming
        var mEvents = Missiles.update(dt, game.worldView)

        for (var i = 0; i < mEvents.intercepted.length; i++) {
            var kill = mEvents.intercepted[i]
            game.addScore(kill.points)
            game.detonate(kill.x, kill.y)
            Particles.debris(kill.x, kill.y, kill.isSmart ? 7 : 4, 32, "missile")
        }

        for (var s = 0; s < mEvents.splits.length; s++) {
            sound.play("mirv_split")
            Particles.burst(mEvents.splits[s].x, mEvents.splits[s].y,
                            8, 30, "missile")
        }

        for (var k = 0; k < mEvents.impacts.length; k++) {
            var hit = mEvents.impacts[k]
            game.detonate(hit.x, hit.y)
            if (hit.type === "city") {
                if (Cities.destroy(hit.index)) {
                    sound.play("city_destroyed")
                    game.kick(4.5)
                    Particles.debris(hit.x, hit.y, 22, 45, "cities")
                    Particles.smoke(hit.x, hit.y - 4, 7, "dim")
                } else {
                    // The fourth loss of a wave: the warhead lands, the city
                    // does not fall. Still shakes -- it still hit something.
                    sound.play("impact")
                    game.kick(2.0)
                }
            } else if (hit.type === "battery") {
                if (Batteries.destroy(hit.index)) {
                    sound.play("city_destroyed")
                    game.kick(3.5)
                    Particles.debris(hit.x, hit.y, 16, 40, "ground")
                    Particles.smoke(hit.x, hit.y - 3, 5, "dim")
                } else {
                    sound.play("impact")
                    game.kick(1.5)
                }
            }
        }

        // ---- bombers and satellites
        var fEvents = Fliers.update(dt, game.worldView)
        if (fEvents.spawned)
            sound.startLoop("flier_hum")
        for (var d = 0; d < fEvents.destroyed.length; d++) {
            var dead = fEvents.destroyed[d]
            game.addScore(dead.points)
            game.detonate(dead.x, dead.y)
            Particles.debris(dead.x, dead.y, 14, 42, "missile")
            sound.stopLoop("flier_hum")
        }
        for (var f = 0; f < fEvents.drops.length; f++)
            Missiles.spawnFromFlier(fEvents.drops[f].x, fEvents.drops[f].y,
                                    game.wave, game.allTargets())
        if (Fliers.count() === 0 && fEvents.destroyed.length === 0)
            sound.stopLoop("flier_hum")

        // ---- is the wave over?
        if (Missiles.allDone() && Fliers.allDone() && Abm.count() === 0
                && !Explosions.anyActive()) {
            if (Cities.allDestroyed() && game.bonusCities === 0) {
                game.endRun()
                return
            }
            game.beginTally()
        }

        game.paint()
    }

    // ---------------------------------------------------------- tally logic

    function beginTally() {
        game.phase = "tally"
        game.tallyPhase = "missiles"
        game.tallyTimer = 0
        game.tallyMissilesCounted = 0
        game.tallyCitiesCounted = 0
        game.tallyBonusEarned = false
        game.tallyRebuilt = 0
        game.tallyDone = 0
        game.tallyMultiplier = Waves.get(game.wave).multiplier
        game.tallyMissilesLeft = Batteries.totalAmmo()
        game.tallyCitiesLeft = Cities.aliveCount()
        sound.stopLoop("flier_hum")
    }

    function stepTally(dt) {
        game.tallyTimer += dt

        if (game.tallyPhase === "missiles") {
            if (game.tallyTimer >= game.tickInterval) {
                game.tallyTimer -= game.tickInterval
                if (game.tallyMissilesCounted < game.tallyMissilesLeft) {
                    game.tallyMissilesCounted += 1
                    game.addRaw(5 * game.tallyMultiplier)
                    sound.play("bonus_tick")
                } else {
                    game.tallyPhase = "cities"
                    game.tallyTimer = 0
                }
            }

        } else if (game.tallyPhase === "cities") {
            if (game.tallyTimer >= game.tickInterval * 2) {
                game.tallyTimer -= game.tickInterval * 2
                if (game.tallyCitiesCounted < game.tallyCitiesLeft) {
                    game.tallyCitiesCounted += 1
                    game.addRaw(100 * game.tallyMultiplier)
                    sound.play("bonus_tick")
                } else {
                    // Any bonus city earned during the count-up is spent here,
                    // rebuilding what the wave took. Checked after the count
                    // rather than before, because the count itself can cross
                    // the ten-thousand mark and earn one.
                    game.tallyPhase = "bonus"
                    game.tallyTimer = 0
                    if (Cities.destroyedCount() > 0 && game.bonusCities > 0) {
                        game.tallyRebuilt = Cities.deployBonus(game.bonusCities)
                        game.bonusCities -= game.tallyRebuilt
                        game.tallyBonusEarned = game.tallyRebuilt > 0
                    }
                }
            }

        } else if (game.tallyPhase === "bonus") {
            if (game.tallyTimer >= 1.0) {
                game.tallyPhase = "done"
                game.tallyDone = 0
            }

        } else if (game.tallyPhase === "done") {
            game.tallyDone += dt
            if (game.tallyDone >= game.donePause)
                game.startNextWave()
        }
    }

    // --------------------------------------------------------------- sound

    // `soundVolume` exists for the screenshot harness, which needs to be
    // silent without pretending the player has muted it -- the title screen's
    // hint line reads soundEnabled, and a shot taken with sound switched off
    // would tell every reader of the README to press M to UNMUTE.
    property real soundVolume: 0.6

    Sound {
        id: sound
        muted: !game.soundEnabled
        masterVolume: game.soundVolume
    }

    readonly property bool soundAvailable: sound.available

    // --------------------------------------------------------------- layout

    // The field is 256 x 231 units with the ground at 213 -- the original's
    // coordinate space, kept, because every shape in the game is authored in
    // it. The cabinet is the largest box of that shape that fits.
    readonly property real fieldAspect: World.GAME_W / World.GAME_H
    readonly property real stageW: Math.min(game.width, game.height * game.fieldAspect)
    readonly property real stageH: game.stageW / game.fieldAspect

    // The canvases are rasterised on the CPU and uploaded as a texture every
    // frame, so their cost is their pixel count and nothing else. Capping the
    // render size keeps a cabinet on a 4K display from costing four times what
    // one on a 1080p display does; the bloom and the tube are what carry it
    // the rest of the way up, and they run on the GPU.
    readonly property int maxRenderW: 1400
    readonly property int renderW: Math.max(256, Math.min(Math.round(game.stageW),
                                                          game.maxRenderW))
    readonly property int renderH: Math.round(game.renderW / game.fieldAspect)
    readonly property real zoom: game.renderW / World.GAME_W

    // Text sizes as ratios of the render height, so they scale with the
    // cabinet and land at the same place at any size.
    readonly property int fontSmall: Math.max(9, Math.floor(game.renderH * 0.021))
    readonly property int fontMedium: Math.max(11, Math.floor(game.renderH * 0.030))
    readonly property int fontLarge: Math.max(15, Math.floor(game.renderH * 0.055))

    function paint() {
        field.requestPaint()
        game.refresh()
    }

    // Invalidate every binding that reads through a JS module. Called from
    // paint(), and separately from anything that changes module state without
    // painting -- a run that ends returns from step() before it repaints, and
    // the harness changes state without stepping at all. Miss one of those and
    // the HUD keeps showing the last number it happened to see.
    function refresh() {
        game.tick = game.tick + 1
    }

    function repaintBackdrop() {
        backdrop.requestPaint()
    }

    onPalChanged: game.repaintBackdrop()

    Item {
        id: stage
        width: game.stageW
        height: game.stageH
        anchors.centerIn: parent

        Glass {
            id: glass
            anchors.fill: parent
            clock: game.clock
            crtAmount: game.crtEnabled ? 1 : 0
            scanCount: World.GAME_H

            Item {
                id: renderRoot
                width: game.renderW
                height: game.renderH
                transformOrigin: Item.TopLeft
                scale: game.stageW / game.renderW

                x: game.shakeX * scale
                y: game.shakeY * scale

                // The sky, the hills and the floor grid. Painted when the
                // palette, the wave or the size changes and not otherwise --
                // once per theme switch in practice rather than once a frame.
                Canvas {
                    id: backdrop
                    anchors.fill: parent
                    renderStrategy: Canvas.Cooperative
                    onPaint: {
                        var ctx = getContext("2d")
                        ctx.reset()
                        ctx.save()
                        ctx.scale(game.zoom, game.zoom)
                        ctx.lineCap = "round"
                        ctx.lineJoin = "round"
                        Backdrop.draw(ctx, game.pal, 1 / game.zoom)
                        ctx.restore()
                    }
                    onWidthChanged: requestPaint()
                    onHeightChanged: requestPaint()
                }

                // Everything that moves.
                Canvas {
                    id: field
                    anchors.fill: parent
                    renderStrategy: Canvas.Cooperative

                    onPaint: {
                        var ctx = getContext("2d")
                        ctx.reset()
                        ctx.save()
                        ctx.scale(game.zoom, game.zoom)
                        ctx.lineCap = "round"
                        ctx.lineJoin = "round"

                        // One field unit is `zoom` device pixels, so a line
                        // meant to be one pixel on screen is 1/zoom units wide
                        // here. Every draw call takes this as `lw`.
                        var lw = 1 / game.zoom
                        var pal = game.pal
                        var t = game.clock

                        // Back to front. Cities before batteries because a
                        // launcher stands in front of the skyline; explosions
                        // over both because they are in the air.
                        Cities.draw(ctx, pal, lw, t)
                        Batteries.draw(ctx, pal, lw, t)
                        Missiles.draw(ctx, pal, lw, t)
                        Fliers.draw(ctx, pal, lw, t)
                        Abm.draw(ctx, pal, lw, t)
                        Particles.draw(ctx, pal, lw)
                        Explosions.draw(ctx, pal, lw, t)

                        if (game.phase === "playing")
                            Crosshair.draw(ctx, pal, lw, t,
                                           game.ammoLeft > 0 && !Abm.full())

                        ctx.restore()
                    }
                }

                Hud {
                    anchors.fill: parent
                    visible: game.phase === "playing" || game.phase === "tally"
                             || game.phase === "gameOver"
                    game: game
                }

                TitleScreen {
                    anchors.fill: parent
                    visible: game.phase === "title"
                    game: game
                }

                TallyScreen {
                    anchors.fill: parent
                    visible: game.phase === "tally"
                    game: game
                }

                GameOverScreen {
                    anchors.fill: parent
                    visible: game.phase === "gameOver"
                    game: game
                }

                ScoreEntry {
                    anchors.fill: parent
                    visible: game.phase === "entry"
                    game: game
                }
            }
        }

        // Aiming. Outside the Screen on purpose: everything inside it is
        // hidden by the shader chain's `hideSource`, and a hidden item does
        // not receive mouse events.
        MouseArea {
            id: aim
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            // The reticle is drawn in the field, so the pointer that draws it
            // should not also be on screen.
            cursorShape: Qt.BlankCursor

            function toField(px, py) {
                var s = game.stageW / World.GAME_W
                return { x: px / s, y: py / s }
            }

            onPositionChanged: function (e) {
                var p = toField(e.x, e.y)
                Crosshair.setPosition(p.x, p.y)
            }

            onPressed: function (e) {
                game.forceActiveFocus()
                if (game.phase !== "playing") return
                var p = toField(e.x, e.y)
                Crosshair.setPosition(p.x, p.y)
                // Right-click fires the centre launcher specifically -- Delta
                // is three times faster than the flanks and worth being able
                // to spend deliberately rather than only when it is nearest.
                if (e.button === Qt.RightButton) game.fireFrom(1)
                else game.fireAt(p.x, p.y)
            }
        }
    }

    Component.onCompleted: {
        Cities.init()
        Batteries.init()
        game.resetTitle()
    }
}

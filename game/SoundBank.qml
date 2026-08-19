import QtQuick
import QtMultimedia

// The voices. Loaded through a Loader by Sound.qml, and only reached at all if
// `import QtMultimedia` resolves -- which is why this is a separate file
// rather than a block inside Sound.qml. An import that fails takes its whole
// document down with it, so the import that might not be there has to live in
// a document nothing else depends on.
Item {
    id: bank

    property real masterVolume: 0.6
    property bool muted: false

    // One-shots get more than one voice each. SoundEffect.play() on an effect
    // that is already playing restarts it rather than layering, so a single
    // voice would mean the second of two simultaneous explosions cutting the
    // first off -- which in this game is not an edge case, it is what happens
    // every time a MIRV comes apart over a fireball.
    //
    // The explosion gets more than the rest for the same reason: eight can be
    // on the field at once by design.
    readonly property var oneShots: [
        "launch", "explosion", "impact", "city_destroyed", "mirv_split",
        "wave_start", "bonus_tick", "bonus_city", "game_over"
    ]
    readonly property int voicesPer: 4

    // Held sounds. Genuinely continuous, so they loop rather than being
    // re-triggered on a timer -- the WAV is cross-faded at the seam so the
    // repeat does not tick (see audio/make_sounds.py).
    readonly property var loops: ["flier_hum"]

    // name -> array of SoundEffect, and the next voice to use.
    //
    // `ready` is set explicitly rather than bound to the pool's contents.
    // Bindings do not fire on in-place mutation of a `var` object, and a
    // previous port of this pattern shipped a completely silent game for a day
    // because `ready` was bound to `Object.keys(pool).length > 0` while the
    // pool was filled with `pool[name] = ...` inside Component.onCompleted:
    // the binding had already been evaluated against an empty object and was
    // never invalidated. Nothing logged anything. The pool is assembled in a
    // local and assigned once.
    property var pool: ({})
    property var cursor: ({})

    property bool ready: false

    Component {
        id: effectComponent
        SoundEffect {
            volume: bank.muted ? 0 : bank.masterVolume
        }
    }

    function makeVoices(name, count, looping) {
        var voices = []
        for (var i = 0; i < count; i++) {
            var fx = effectComponent.createObject(bank, {
                "source": Qt.resolvedUrl("../audio/" + name + ".wav"),
                "loops": looping ? SoundEffect.Infinite : 1
            })
            if (fx) voices.push(fx)
        }
        return voices
    }

    function play(name) {
        var voices = bank.pool[name]
        if (!voices || bank.muted) return
        var i = bank.cursor[name] % voices.length
        bank.cursor[name] = i + 1
        voices[i].play()
    }

    function startLoop(name) {
        var voices = bank.pool[name]
        if (!voices || bank.muted) return
        if (!voices[0].playing) voices[0].play()
    }

    function stopLoop(name) {
        var voices = bank.pool[name]
        if (!voices) return
        voices[0].stop()
    }

    function stopAll() {
        for (var name in bank.pool)
            for (var i = 0; i < bank.pool[name].length; i++)
                bank.pool[name][i].stop()
    }

    Component.onCompleted: {
        var pool = {}
        var cursor = {}

        for (var i = 0; i < bank.oneShots.length; i++) {
            var voices = makeVoices(bank.oneShots[i], bank.voicesPer, false)
            if (voices.length > 0) {
                pool[bank.oneShots[i]] = voices
                cursor[bank.oneShots[i]] = 0
            }
        }
        for (var j = 0; j < bank.loops.length; j++) {
            var held = makeVoices(bank.loops[j], 1, true)
            if (held.length > 0) {
                pool[bank.loops[j]] = held
                cursor[bank.loops[j]] = 0
            }
        }

        // One assignment each, so the change actually propagates.
        bank.pool = pool
        bank.cursor = cursor
        bank.ready = Object.keys(pool).length > 0
    }
}

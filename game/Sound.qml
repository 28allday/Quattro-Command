import QtQuick

// Sound, or silence, without the game having to care which.
//
// Sound needs QtMultimedia, which is NOT a Quickshell dependency -- a machine
// running omarchy-shell may well not have qt6-multimedia installed. So the
// import lives in SoundBank.qml and is reached through a Loader: if the module
// is missing the Loader reports an error, `available` stays false, and every
// call below becomes a no-op. The game plays exactly the same, without sound.
//
// Do not "simplify" this by importing QtMultimedia here. A failed import takes
// down the document that contains it, and that document would be the game.
Item {
    id: root

    property bool muted: false
    property real masterVolume: 0.6

    readonly property bool available: bank.status === Loader.Ready
                                      && bank.item && bank.item.ready

    // Set when the module is missing, so the host can say so once rather than
    // leaving the player wondering where the sound went.
    readonly property bool unavailable: bank.status === Loader.Error

    Loader {
        id: bank
        source: "SoundBank.qml"
        asynchronous: false
        onStatusChanged: {
            if (status === Loader.Error)
                console.warn("Quattro Command: QtMultimedia not available, running silent."
                             + " Install qt6-multimedia for sound.")
        }
    }

    Binding {
        target: bank.item
        property: "muted"
        value: root.muted
        when: bank.status === Loader.Ready
    }

    Binding {
        target: bank.item
        property: "masterVolume"
        value: root.masterVolume
        when: bank.status === Loader.Ready
    }

    function play(name) {
        if (root.available)
            bank.item.play(name)
    }

    function startLoop(name) {
        if (root.available)
            bank.item.startLoop(name)
    }

    function stopLoop(name) {
        if (root.available)
            bank.item.stopLoop(name)
    }

    function stopAll() {
        if (root.available)
            bank.item.stopAll()
    }
}

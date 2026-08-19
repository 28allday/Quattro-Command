import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import QtQuick
import QtQuick.Window
import qs.Commons
import qs.Ui
import "game"

// Quattro Command for omarchy-shell. Summoned through the shell host:
//   omarchy-shell shell toggle nosignal.quattro-command
//
// This file is the cabinet, not the game. Everything that has to know about
// the shell lives here -- the window, keyboard focus, the theme, and the score
// table on disk -- and game/Game.qml stays pure QtQuick so it can be run and
// tuned in a plain QML window without restarting the shell.
//
// `keepLoaded: true` in manifest.json matters: without it the host's Loader
// destroys this instance on hide, so closing the panel mid-wave would drop the
// game rather than pause it. Hidden, the scene stops rendering and
// FrameAnimation stops with it -- which is exactly the pause you want.
Item {
    id: root

    property bool opened: false

    readonly property string selfId: "nosignal.quattro-command"

    // Injected by the shell host after the Loader resolves. Used to keep the
    // host's open-flag honest on close(), and to self-restore if the host's
    // panel Instantiator rebuild destroys a visibly-open instance.
    property var shell: null
    onShellChanged: {
        if (!root.opened && root.shell && root.shell.openPanelIds
                && root.shell.openPanelIds[root.selfId] === true)
            root.open("{}")
    }

    // ---------------------------------------------------------------- theme

    // The game wants the whole sixteen-colour terminal palette, not the five
    // roles the shell's Color singleton exposes -- because the original mapped
    // ANSI slots onto game roles and rotated that mapping every two waves, and
    // that rotation is the game's one real visual signature. So the four
    // foundational colours come from Color (live, and already merged with any
    // shell.toml overrides) and the sixteen come from the theme's own
    // colors.toml, which is the same file Color itself reads.
    //
    // Path matched to Color.qml deliberately, including its use of a literal
    // ~/.local/state rather than XDG_STATE_HOME: reading a *different* file
    // from the one the shell reads would mean the game could disagree with the
    // desktop about which theme is active.
    readonly property string themePath:
        Quickshell.env("HOME") + "/.local/state/omarchy/current/theme"

    // Sensible until the file loads, and the whole palette if it never does.
    property var ansi: [
        Color.background, Color.urgent, Color.accent, Color.accent,
        Color.accent, Color.accent, Color.accent, Color.foreground,
        Color.muted, Color.urgent, Color.accent, Color.foreground,
        Color.accent, Color.urgent, Color.accent, Color.foreground
    ]

    function parseColors(text) {
        var next = root.ansi.slice()
        var lines = String(text || "").split("\n")
        var found = 0
        for (var i = 0; i < lines.length; i++) {
            var m = lines[i].match(/^\s*color(\d+)\s*=\s*"?(#[0-9a-fA-F]{6})"?/)
            if (!m) continue
            var idx = parseInt(m[1], 10)
            if (idx >= 0 && idx < 16) { next[idx] = m[2]; found++ }
        }
        // All or nothing. A theme that only defines half the palette would
        // otherwise give the wave rotation a hole in it, and the wave it lands
        // on would render in whatever the fallback happened to be.
        if (found === 16) root.ansi = next
    }

    FileView {
        id: colorsFile
        path: root.themePath + "/colors.toml"
        watchChanges: true
        printErrors: false
        onLoaded: root.parseColors(text())
        // text() is stale inside the change signal itself, so both paths go
        // through reload -> onLoaded and always parse fresh content.
        onFileChanged: reload()
    }

    // A theme switch is pushed to the shell over IPC rather than written where
    // an inotify watch on a symlinked path would see it, so watching the file
    // is not enough on its own. The Color singleton *is* updated by that push,
    // so its accent changing is the signal that the palette underneath has
    // moved and colors.toml is worth re-reading.
    Connections {
        target: Color
        function onAccentChanged() { colorsFile.reload() }
        function onBackgroundChanged() { colorsFile.reload() }
    }

    // Forced opaque. Omarchy themes routinely give shell surfaces an alpha --
    // a see-through menu is the point -- but a play field you can read the
    // desktop through is unplayable.
    function opaque(c) { return Qt.rgba(c.r, c.g, c.b, 1.0) }

    property color background: root.opaque(Color.menu.background)
    // The accent, not Color.menu.border: the menu border is a low-contrast
    // colour meant to separate a popup from the desktop by a hair, and at two
    // pixels around a dark play field it cannot be seen. The accent is the
    // same colour Hyprland outlines the focused window with, so the cabinet
    // reads as a thing with an edge.
    property color border: root.opaque(Color.accent)
    // Border.flat states the edge outright. NOT Border.surfaceSpec, which
    // treats the colour and width passed to it as *fallbacks* the theme
    // overrides -- so on any theme defining a menu border, both are ignored.
    property var borderSpec: Border.flat(root.border, root.frameWidth)

    readonly property int cornerRadius: Style.cornerRadius
    readonly property int frameWidth: 2

    // ------------------------------------------------------- self-registration

    // `omarchy plugin enable` only writes the bar.layout entry for a
    // panel+bar-widget plugin, so the keybinding dies with the bar icon unless
    // the plugin claims its own plugins[] entry. Upstream fix is PR #6510;
    // until it lands, self-register on first open. Idempotent, jq-guarded.
    //
    // Harness: sh -c <script> plugin-selfref <id> -- $0 is the label, $1 the id.
    property bool selfRefEnsured: false
    readonly property string ensureSelfRefScript: [
        'umask 077',
        'id="$1"',
        'f="$HOME/.config/omarchy/shell.json"',
        '[ -f "$f" ] || exit 0',
        '[ -L "$f" ] && exit 0',
        'command -v jq >/dev/null 2>&1 || exit 0',
        'jq -e --arg id "$id" \'any(.plugins[]?; (.id // empty) == $id)\' "$f" >/dev/null && exit 0',
        'tmp="$f.selfref.$$"',
        'jq --arg id "$id" \'.plugins = ((.plugins // []) + [{id: $id}])\' "$f" > "$tmp" || {',
        '  rm -f "$tmp"; exit 1;',
        '}',
        '[ -s "$tmp" ] || { rm -f "$tmp"; exit 1; }',
        'chmod --reference="$f" "$tmp" 2>/dev/null || true',
        'mv "$tmp" "$f"'
    ].join("\n")

    function ensureSelfReference() {
        if (root.selfRefEnsured) return
        root.selfRefEnsured = true
        Quickshell.execDetached(["sh", "-c", root.ensureSelfRefScript,
                                 "plugin-selfref", root.selfId])
    }

    // ---------------------------------------------------------- persistence

    readonly property string stateDir:
        (Quickshell.env("XDG_STATE_HOME") || (Quickshell.env("HOME") + "/.local/state"))
        + "/omarchy-quattro-command"
    readonly property string statePath: root.stateDir + "/state.json"

    property var scores: []
    property bool soundEnabled: true
    property bool crtEnabled: true
    property bool stateLoaded: false

    function applyState(text) {
        try {
            var o = JSON.parse(text)
            if (o && Array.isArray(o.scores)) {
                // Filter rather than trust: this file is hand-editable, and a
                // malformed row would otherwise reach the score table and
                // render as undefined.
                var clean = []
                for (var i = 0; i < o.scores.length; i++) {
                    var e = o.scores[i]
                    if (e && typeof e.score === "number" && typeof e.initials === "string")
                        clean.push({ initials: e.initials.substring(0, 3).toUpperCase(),
                                     score: Math.max(0, Math.floor(e.score)) })
                }
                clean.sort(function (a, b) { return b.score - a.score })
                root.scores = clean.slice(0, 10)
            }
            if (o && typeof o.soundEnabled === "boolean")
                root.soundEnabled = o.soundEnabled
            if (o && typeof o.crtEnabled === "boolean")
                root.crtEnabled = o.crtEnabled
        } catch (e) {
            // A missing or corrupt file just means no scores yet.
        }
        root.stateLoaded = true
    }

    function saveState() {
        if (!root.stateLoaded) return
        stateFile.setText(JSON.stringify({
            scores: root.scores,
            soundEnabled: root.soundEnabled,
            crtEnabled: root.crtEnabled
        }, null, 2))
    }

    FileView {
        id: stateFile
        path: root.statePath
        atomicWrites: true
        printErrors: false
        onLoaded: root.applyState(text())
        onLoadFailed: function (err) { root.applyState("") }
    }

    Process {
        id: mkStateDir
        command: ["mkdir", "-p", root.stateDir]
        onExited: stateFile.reload()
    }

    Component.onCompleted: mkStateDir.running = true

    // ----------------------------------------------------------- open/close

    function open(payloadJson) {
        root.opened = true
        root.ensureSelfReference()
        Qt.callLater(function () { game.forceActiveFocus() })
    }

    function close() {
        if (!root.opened) return
        root.opened = false
        if (root.shell && typeof root.shell.hide === "function")
            root.shell.hide(root.selfId)
    }

    function toggle() {
        if (root.opened) root.close(); else root.open("{}")
    }

    // -------------------------------------------------------------- window

    PanelWindow {
        id: panel
        visible: root.opened
        anchors { top: true; bottom: true; left: true; right: true }
        color: "transparent"
        WlrLayershell.namespace: "omarchy-quattro-command"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: root.opened ? WlrKeyboardFocus.Exclusive
                                                 : WlrKeyboardFocus.None
        exclusionMode: ExclusionMode.Ignore

        MouseArea {
            anchors.fill: parent
            onClicked: root.close()
        }

        BorderSurface {
            id: surface
            anchors.centerIn: parent
            // A Rectangle draws its border inside its own bounds, so a child
            // filling the same rect paints straight over it. The surface has
            // to be bigger than the cabinet on every side or the 2px edge is
            // drawn and then immediately covered.
            width: cabinet.width + 2 * root.frameWidth + root.cornerRadius
            height: cabinet.height + 2 * root.frameWidth + root.cornerRadius
            radius: root.cornerRadius
            color: root.background
            borderSpec: root.borderSpec
            clip: true

            // Swallow clicks so they do not fall through to the close-on-click
            // backdrop behind. Aiming and firing is handled inside the game.
            MouseArea { anchors.fill: parent; onClicked: {} }

            Item {
                id: cabinet
                anchors.centerIn: parent

                // The play field is 256 x 231 units, so the cabinet is the
                // largest box of that shape that leaves the bar and the usual
                // gaps alone. No integer-scale dance: this is stroked vectors
                // through a shader chain, not a pixel grid.
                readonly property real availW: panel.width - Style.gapsOut * 4
                readonly property real availH: panel.height - Style.bar.sizeHorizontal
                                               - Style.gapsOut * 4
                // Comfortably under half the desktop. A full-screen game is a
                // game you have to close to get anything done, and this one is
                // meant to sit on the desktop beside your work.
                readonly property real fraction: 0.62
                readonly property real aspect: 256 / 231

                readonly property real boxW: Math.max(360, availW * fraction)
                readonly property real boxH: Math.max(325, availH * fraction)

                width: Math.round(Math.min(boxW, boxH * aspect))
                height: Math.round(width / aspect)

                Game {
                    id: game
                    anchors.fill: parent

                    // Explicitly stopped while hidden rather than relying on a
                    // hidden window not producing frames. It amounts to the
                    // same thing today, but "the game pauses when you close
                    // it" is a promise the README makes and it should not rest
                    // on Qt's render loop happening to stall.
                    autoRun: root.opened

                    fontFamily: Style.fontFamily

                    colBackground: root.opaque(Color.background)
                    colForeground: Color.foreground
                    colAccent: Color.accent
                    colDim: Color.muted
                    ansi: root.ansi

                    scores: root.scores
                    soundEnabled: root.soundEnabled
                    crtEnabled: root.crtEnabled

                    onScoresUpdated: function (list) {
                        root.scores = list
                        root.saveState()
                    }
                    onSoundToggleRequested: {
                        root.soundEnabled = !root.soundEnabled
                        root.saveState()
                    }
                    onCrtToggleRequested: {
                        root.crtEnabled = !root.crtEnabled
                        root.saveState()
                    }
                    onQuitRequested: root.close()
                }
            }
        }
    }
}

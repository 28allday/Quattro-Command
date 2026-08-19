import QtQuick

// Score, best and wave, across the top.
//
// Text is QML rather than canvas drawing. The field is stroked through a
// scaled 2D context and glyphs pushed through that same scale come out soft --
// and unlike the field, text does not benefit from being soft. These are laid
// out in field units multiplied by the zoom, so they sit exactly where the
// canvas would have put them while being rendered at the render surface's own
// resolution.
//
// It does still go through the bloom and the tube: the HUD is part of the
// picture on the glass, not an overlay stuck on the front of it.
Item {
    id: root

    required property var game

    readonly property real u: root.game.zoom      // one field unit, in pixels

    Text {
        x: Math.round(8 * root.u)
        y: Math.round(6 * root.u)
        text: ("00000" + root.game.score).slice(-6)
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontMedium
    }

    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        y: Math.round(7 * root.u)
        visible: root.game.highScore > 0
        text: ("00000" + root.game.highScore).slice(-6)
        color: root.game.pal.dim
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
    }

    Text {
        id: waveLabel
        x: parent.width - width - Math.round(8 * root.u)
        y: Math.round(7 * root.u)
        text: "WAVE " + root.game.wave
        color: root.game.pal.fg
        opacity: 0.75
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
    }

    // The multiplier, under the wave number. It is the whole reason to keep
    // rounds in a launcher rather than spraying them, and the original made
    // you wait until the tally to find out what it was.
    Text {
        x: parent.width - width - Math.round(8 * root.u)
        y: waveLabel.y + waveLabel.height + Math.round(1 * root.u)
        text: "x" + root.game.waveMultiplier
        color: root.game.pal.dim
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
    }

    // A hairline under it all, as before.
    Rectangle {
        x: 0
        y: Math.round(20 * root.u)
        width: parent.width
        height: Math.max(1, Math.round(root.u * 0.5))
        color: root.game.pal.dim
        opacity: 0.35
    }
}

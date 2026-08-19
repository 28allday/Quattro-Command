import QtQuick

// The attract screen: the name, the controls, the prompt and the table.
//
// It sits over the live field, which on the title screen is showing six intact
// cities and three loaded launchers under a starfield. That is deliberate --
// the thing the game is about is already on screen behind its own name.
Item {
    id: root

    required property var game

    readonly property real u: root.game.zoom

    Text {
        id: title
        width: parent.width
        y: parent.height * 0.14
        horizontalAlignment: Text.AlignHCenter
        text: "QUATTRO COMMAND"
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontLarge
        font.letterSpacing: root.game.fontLarge * 0.16
    }

    Text {
        id: subtitle
        width: parent.width
        y: title.y + title.height + 4 * root.u
        horizontalAlignment: Text.AlignHCenter
        text: "MISSILE DEFENCE"
        color: root.game.pal.fg
        opacity: 0.5
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
        font.letterSpacing: root.game.fontSmall * 0.3
    }

    // Two faint rules boxing the name in, with corner ticks -- the same
    // wireframe furniture the original drew round its title, kept because it
    // is the one piece of chrome that makes the screen look like a machine
    // rather than a menu.
    Repeater {
        model: [title.y - 8 * root.u, subtitle.y + subtitle.height + 8 * root.u]
        Item {
            x: parent.width * 0.16
            y: Math.round(modelData)
            width: parent.width * 0.68
            height: 1

            readonly property bool isTop: index === 0
            readonly property real tick: parent.width * 0.022

            Rectangle {
                width: parent.width
                height: Math.max(1, Math.round(root.u * 0.6))
                color: root.game.pal.ground
                opacity: 0.28
            }
            Rectangle {
                y: parent.isTop ? 0 : -parent.tick
                width: Math.max(1, Math.round(root.u * 0.6))
                height: parent.tick
                color: root.game.pal.ground
                opacity: 0.28
            }
            Rectangle {
                x: parent.width - width
                y: parent.isTop ? 0 : -parent.tick
                width: Math.max(1, Math.round(root.u * 0.6))
                height: parent.tick
                color: root.game.pal.ground
                opacity: 0.28
            }
        }
    }

    Text {
        width: parent.width
        y: parent.height * 0.40
        horizontalAlignment: Text.AlignHCenter
        text: "MOUSE AIM · CLICK FIRE · A S D LAUNCHERS · F1 TUBE · M "
              + (root.game.soundEnabled ? "MUTE" : "UNMUTE")
        color: root.game.pal.fg
        opacity: 0.38
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
    }

    Text {
        width: parent.width
        y: parent.height * 0.50
        horizontalAlignment: Text.AlignHCenter
        text: "PRESS ENTER TO START"
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontMedium
        // Driven off the game clock rather than a NumberAnimation, so every
        // blinking thing in the game keeps the same phase.
        opacity: root.visible ? 0.5 + Math.sin(root.game.clock * 3) * 0.3 : 0
    }

    Text {
        id: tableHeading
        width: parent.width
        y: parent.height * 0.60
        horizontalAlignment: Text.AlignHCenter
        visible: root.game.scores.length > 0
        text: "HIGH SCORES"
        color: root.game.pal.bright
        opacity: 0.8
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
        font.letterSpacing: root.game.fontSmall * 0.25
    }

    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        y: tableHeading.y + tableHeading.height + 4 * root.u
        width: parent.width * 0.38
        spacing: Math.round(1.2 * root.u)

        Repeater {
            model: root.game.scores

            Item {
                width: parent.width
                height: rank.height

                Text {
                    id: rank
                    text: (index + 1 < 10 ? " " : "") + (index + 1) + ".  "
                          + modelData.initials
                    color: index === 0 ? root.game.pal.bright
                                       : root.game.pal.fg
                    opacity: index === 0 ? 1.0 : 0.7
                    font.family: root.game.fontFamily
                    font.pixelSize: root.game.fontSmall
                }

                Text {
                    anchors.right: parent.right
                    text: ("00000" + modelData.score).slice(-6)
                    color: rank.color
                    opacity: rank.opacity
                    font.family: root.game.fontFamily
                    font.pixelSize: root.game.fontSmall
                }
            }
        }
    }
}

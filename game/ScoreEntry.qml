import QtQuick

// Three letters and Enter -- the arcade's own ceremony, kept intact.
//
// Type them or nudge them: a letter key sets the current box and advances, the
// up/down arrows walk the alphabet, left/right choose a box. The blinking box
// is the one being edited.
Item {
    id: root

    required property var game

    readonly property real u: root.game.zoom
    readonly property real boxW: Math.floor(width * 0.075)
    readonly property real boxH: Math.floor(boxW * 1.3)
    readonly property real gap: Math.floor(boxW * 0.4)

    Rectangle {
        anchors.fill: parent
        color: root.game.pal.sky
        opacity: 0.6
    }

    Text {
        id: banner
        width: parent.width
        y: parent.height * 0.20
        horizontalAlignment: Text.AlignHCenter
        text: "NEW HIGH SCORE"
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontLarge
        font.letterSpacing: root.game.fontLarge * 0.12
        opacity: root.visible ? 0.7 + Math.sin(root.game.clock * 4) * 0.3 : 0
    }

    Text {
        id: value
        width: parent.width
        y: banner.y + banner.height + 6 * root.u
        horizontalAlignment: Text.AlignHCenter
        text: ("00000" + root.game.score).slice(-6)
        color: root.game.pal.fg
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontMedium
    }

    Row {
        id: boxes
        anchors.horizontalCenter: parent.horizontalCenter
        y: value.y + value.height + 14 * root.u
        spacing: root.gap

        Repeater {
            model: 3

            Item {
                width: root.boxW
                height: root.boxH

                readonly property bool selected: index === root.game.entryPosition
                // Slower than anything else that blinks in the game, on
                // purpose: this one is an invitation, not a warning.
                readonly property bool blinkOn:
                    Math.floor(root.game.entryBlink * 3) % 2 === 0

                Rectangle {
                    anchors.fill: parent
                    color: "transparent"
                    border.width: parent.selected ? Math.max(2, Math.round(2.4 * root.u))
                                                  : Math.max(1, Math.round(1.4 * root.u))
                    border.color: parent.selected
                                  ? (parent.blinkOn ? root.game.pal.bright
                                                    : root.game.pal.dim)
                                  : root.game.pal.dim
                }

                // Carets, so the arrow keys are discoverable without reading
                // the hint line.
                Repeater {
                    model: parent.selected ? 2 : 0
                    Canvas {
                        width: 9 * root.u
                        height: 6 * root.u
                        x: (root.boxW - width) / 2
                        y: index === 0 ? -height - 2.5 * root.u
                                       : root.boxH + 2.5 * root.u
                        opacity: 0.55
                        onPaint: {
                            var ctx = getContext("2d")
                            ctx.reset()
                            ctx.fillStyle = root.game.pal.bright
                            ctx.beginPath()
                            if (index === 0) {
                                ctx.moveTo(0, height); ctx.lineTo(width, height)
                                ctx.lineTo(width / 2, 0)
                            } else {
                                ctx.moveTo(0, 0); ctx.lineTo(width, 0)
                                ctx.lineTo(width / 2, height)
                            }
                            ctx.closePath()
                            ctx.fill()
                        }
                    }
                }

                Text {
                    anchors.centerIn: parent
                    text: root.game.entryLetters[index]
                    color: root.game.pal.fg
                    font.family: root.game.fontFamily
                    font.pixelSize: root.game.fontLarge
                }
            }
        }
    }

    Text {
        width: parent.width
        y: boxes.y + boxes.height + 14 * root.u
        horizontalAlignment: Text.AlignHCenter
        text: "TYPE LETTERS · ARROWS · ENTER TO CONFIRM"
        color: root.game.pal.dim
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
    }
}

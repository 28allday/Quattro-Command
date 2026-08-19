import QtQuick

// The end, revealed in three beats.
//
// The staging is the original's and is worth keeping: half a second of nothing
// while the last fireball is still collapsing, then the words, then the score,
// then the prompt. All three at once lands on top of your own explosion and
// reads as the game closing the window on you.
//
// "THE END" rather than "GAME OVER", which is what the original said, and is a
// better line: the cities are gone and there is nobody left to play for.
Item {
    id: root

    required property var game

    readonly property real u: root.game.zoom

    // A slow shockwave ring expanding from the middle of the field, the way
    // the original marked the moment. Drawn as Rectangles rather than on the
    // canvas because the canvas has stopped being updated by this point.
    Repeater {
        model: 5
        Rectangle {
            readonly property real t: Math.max(0, root.game.gameOverTimer - index * 0.22)
            readonly property real r: t * 34 * root.u

            anchors.centerIn: parent
            width: r * 2
            height: r * 2
            radius: r
            color: "transparent"
            border.width: Math.max(1, Math.round(root.u * 1.2))
            border.color: root.game.pal.exp1
            visible: r > 0 && r < parent.width * 0.75
            opacity: visible ? Math.max(0, 0.5 - r / (parent.width * 0.75) * 0.5) : 0
        }
    }

    Text {
        id: banner
        width: parent.width
        y: parent.height * 0.34
        horizontalAlignment: Text.AlignHCenter
        visible: root.game.gameOverTimer > 0.5
        text: "THE END"
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontLarge
        font.letterSpacing: root.game.fontLarge * 0.2
        opacity: root.visible ? 0.7 + Math.sin(root.game.clock * 3) * 0.3 : 0
    }

    Text {
        id: finalScore
        width: parent.width
        y: banner.y + banner.height + 6 * root.u
        horizontalAlignment: Text.AlignHCenter
        visible: root.game.gameOverTimer > 1.5
        text: "SCORE  " + ("00000" + root.game.score).slice(-6)
        color: root.game.pal.fg
        opacity: 0.75
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontMedium
    }

    Text {
        width: parent.width
        y: finalScore.y + finalScore.height + 10 * root.u
        horizontalAlignment: Text.AlignHCenter
        visible: root.game.gameOverTimer > 2.5
        text: root.game.qualifies(root.game.score) ? "PRESS ENTER — NEW HIGH SCORE"
                                                   : "PRESS ENTER"
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
        opacity: root.visible ? 0.5 + Math.sin(root.game.clock * 3) * 0.3 : 0
    }
}

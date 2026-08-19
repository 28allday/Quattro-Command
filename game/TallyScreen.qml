import QtQuick

// The count-up between waves.
//
// It reveals itself in the order the points are awarded -- rounds, then
// cities, then the rebuild -- because the count-up *is* the reward, and
// showing the total before it has finished counting throws it away. The
// original got that right and this is its layout, tidied.
//
// The scrim is here rather than in Game.qml so it dims with the panel: the
// field carries on burning underneath, and being able to see your own cities
// still on fire while the game congratulates you on the ones that are not is
// most of the point.
Item {
    id: root

    required property var game

    readonly property real u: root.game.zoom
    readonly property bool pastCities: root.game.tallyPhase === "cities"
                                       || root.game.tallyPhase === "bonus"
                                       || root.game.tallyPhase === "done"
    readonly property bool pastBonus: root.game.tallyPhase === "bonus"
                                      || root.game.tallyPhase === "done"

    Rectangle {
        anchors.fill: parent
        color: root.game.pal.sky
        opacity: 0.55
    }

    Text {
        id: heading
        width: parent.width
        y: parent.height * 0.22
        horizontalAlignment: Text.AlignHCenter
        text: "BONUS POINTS"
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontMedium
        font.letterSpacing: root.game.fontMedium * 0.2
    }

    Text {
        id: multiplier
        width: parent.width
        y: heading.y + heading.height + 2 * root.u
        horizontalAlignment: Text.AlignHCenter
        text: "WAVE " + root.game.wave + "  ×" + root.game.tallyMultiplier
        color: root.game.pal.fg
        opacity: 0.65
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontSmall
    }

    Column {
        id: lines
        anchors.horizontalCenter: parent.horizontalCenter
        y: multiplier.y + multiplier.height + 10 * root.u
        spacing: Math.round(3 * root.u)

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "ROUNDS  " + root.game.tallyMissilesCounted + " × 5 = "
                  + (root.game.tallyMissilesCounted * 5 * root.game.tallyMultiplier)
            color: root.game.pal.fg
            font.family: root.game.fontFamily
            font.pixelSize: root.game.fontMedium
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            visible: root.pastCities
            text: "CITIES  " + root.game.tallyCitiesCounted + " × 100 = "
                  + (root.game.tallyCitiesCounted * 100 * root.game.tallyMultiplier)
            color: root.game.pal.fg
            font.family: root.game.fontFamily
            font.pixelSize: root.game.fontMedium
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            visible: root.pastBonus && root.game.tallyRebuilt > 0
            text: root.game.tallyRebuilt === 1
                  ? "1 CITY REBUILT"
                  : (root.game.tallyRebuilt + " CITIES REBUILT")
            color: root.game.pal.bright
            font.family: root.game.fontFamily
            font.pixelSize: root.game.fontSmall
            opacity: root.visible ? 0.6 + Math.sin(root.game.clock * 6) * 0.4 : 0
        }

        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            visible: root.pastBonus && root.game.bonusCities > 0
            text: root.game.bonusCities + " IN RESERVE"
            color: root.game.pal.fg
            opacity: 0.5
            font.family: root.game.fontFamily
            font.pixelSize: root.game.fontSmall
        }
    }

    Text {
        width: parent.width
        y: parent.height * 0.70
        horizontalAlignment: Text.AlignHCenter
        text: "SCORE  " + ("00000" + root.game.score).slice(-6)
        color: root.game.pal.bright
        font.family: root.game.fontFamily
        font.pixelSize: root.game.fontMedium
    }
}

import QtQuick
import qs.Commons
import qs.Ui

// Bar icon for the Quattro Command cabinet. Clicking runs the exact same IPC
// route a keybinding would use (omarchy-shell shell toggle ...), mirroring how
// the first-party omarchy.menu bar widget summons its panel. Static icon only
// -- nothing runs while the cabinet is closed.
BarWidget {
    id: root
    moduleName: "nosignal.quattro-command"

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    WidgetButton {
        id: button
        anchors.fill: parent
        bar: root.bar
        // A Nerd Font glyph, not an emoji. An emoji renders through the
        // colour font at its own weight and size and sits in the bar looking
        // like it wandered in from somewhere else; a glyph takes the shell
        // font, the theme's accent, and the same optical size as every other
        // icon up there. nf-fa-crosshairs (U+F05B) -- the game's own reticle.
        text: "\uf05b"
        tooltipText: "Quattro Command"
        foreground: Color.accent
        fixedWidth: root.bar && root.bar.vertical ? -1 : Style.space(27)
        fixedHeight: root.bar && root.bar.vertical ? Style.space(26) : -1
        onPressed: function (b) {
            if (!root.bar) return
            root.bar.run("omarchy-shell shell toggle nosignal.quattro-command")
        }
    }
}

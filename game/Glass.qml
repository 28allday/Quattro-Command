import QtQuick

// The glass: bloom, then the tube.
//
// Anything declared inside a Glass is drawn normally into an off-screen
// texture and then put through five passes before it reaches the cabinet:
//
//     content -> [quarter-res copy] -> blur H -> blur V ---.
//          `--------------------------> sharp ------> bloom -> CRT -> screen
//
// The bloom pass is the one that matters. Qt Quick has no additive blend mode,
// so a blurred copy laid over the sharp one with ordinary compositing darkens
// the gaps between the lines rather than lighting them -- light adds, alpha
// replaces. The sum has to happen inside a shader, which is why there is a
// shader chain here at all rather than a stack of translucent Items.
//
// Every intermediate pass is hidden by the ShaderEffectSource that wraps it
// (`hideSource: true`) rather than by `visible: false`. That distinction is
// load-bearing: hideSource hides the item in the scene *after* rendering it to
// its texture, while an invisible item is not reliably rendered at all, and a
// chain built the other way comes out black with nothing in any log.
//
// This file is plain QtQuick, like everything else in game/.
Item {
    id: root

    // Children declared by the caller land in the holder, which is what gets
    // rendered into the first texture.
    default property alias content: holder.data

    // ---- bloom
    property real bloomStrength: 0.72
    // Only pixels brighter than this bloom. Without a threshold the
    // background's own colour blooms into a uniform wash and takes the
    // contrast with it.
    property real bloomThreshold: 0.16
    property real bloomRadius: 1.6

    // ---- tube
    property real crtAmount: 1.0
    property real crtCurvature: 0.055
    property real crtBrightness: 1.30
    property real scanCount: 231        // one line per field unit
    // Driven by the game clock rather than a timer of its own, so the grain
    // stops when the game is paused instead of hissing away behind a still
    // picture.
    property real clock: 0

    // Quarter resolution for the blur. Two 9-tap passes here reach as far as a
    // 33-tap pass at full size, and the downsample is doing part of the blur
    // for nothing.
    readonly property int smallW: Math.max(2, Math.round(width / 4))
    readonly property int smallH: Math.max(2, Math.round(height / 4))

    Item {
        id: holder
        anchors.fill: parent
    }

    // ---- the sharp copy
    ShaderEffectSource {
        id: sharpTex
        anchors.fill: parent
        sourceItem: holder
        hideSource: true
        live: true
        visible: false
    }

    // ---- a quarter-size copy of the same content, for the blur to chew on
    ShaderEffectSource {
        id: smallTex
        anchors.fill: parent
        sourceItem: holder
        textureSize: Qt.size(root.smallW, root.smallH)
        live: true
        visible: false
    }

    // ---- blur, horizontal
    ShaderEffect {
        id: hPass
        anchors.fill: parent
        fragmentShader: Qt.resolvedUrl("../shaders/blur.frag.qsb")
        property variant src: smallTex
        property vector2d texelStep: Qt.vector2d(1.0 / root.smallW, 0.0)
        property real radius: root.bloomRadius
    }
    ShaderEffectSource {
        id: hTex
        anchors.fill: parent
        sourceItem: hPass
        hideSource: true
        textureSize: Qt.size(root.smallW, root.smallH)
        live: true
        visible: false
    }

    // ---- blur, vertical
    ShaderEffect {
        id: vPass
        anchors.fill: parent
        fragmentShader: Qt.resolvedUrl("../shaders/blur.frag.qsb")
        property variant src: hTex
        property vector2d texelStep: Qt.vector2d(0.0, 1.0 / root.smallH)
        property real radius: root.bloomRadius
    }
    ShaderEffectSource {
        id: vTex
        anchors.fill: parent
        sourceItem: vPass
        hideSource: true
        textureSize: Qt.size(root.smallW, root.smallH)
        live: true
        visible: false
    }

    // ---- sharp + blur
    ShaderEffect {
        id: bloomPass
        anchors.fill: parent
        fragmentShader: Qt.resolvedUrl("../shaders/bloom.frag.qsb")
        property variant src: sharpTex
        property variant blurTex: vTex
        property real strength: root.bloomStrength
        property real threshold: root.bloomThreshold
    }
    ShaderEffectSource {
        id: bloomTex
        anchors.fill: parent
        sourceItem: bloomPass
        hideSource: true
        live: true
        visible: false
    }

    // ---- the tube. The only pass that reaches the cabinet.
    ShaderEffect {
        id: crtPass
        anchors.fill: parent
        fragmentShader: Qt.resolvedUrl("../shaders/crt.frag.qsb")
        property variant src: bloomTex
        property vector2d resolution: Qt.vector2d(Math.max(1, root.width),
                                                  Math.max(1, root.height))
        property real scanCount: root.scanCount
        property real amount: root.crtAmount
        property real time: root.clock
        property real curvature: root.crtCurvature
        property real brightness: root.crtBrightness

        // The curve pushes the corners of the picture outside the item, so the
        // shader returns transparent there. Behind that is the cabinet's own
        // background, which is what a switched-off corner of a tube looks like.
        Behavior on amount { NumberAnimation { duration: 220 } }
    }
}

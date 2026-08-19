#version 440

// Quattro Command -- composite the blurred copy back over the sharp one.
//
// This is the whole point of the shader chain. Qt Quick has no additive blend
// mode, so a blurred layer laid over the field with plain source-over
// *darkens* the gaps between the lines instead of lighting them: alpha
// compositing replaces, and light adds. Doing the sum in a shader is the only
// way to get glow that behaves like glow.
//
// Both inputs arrive premultiplied, which is what ShaderEffectSource hands
// over, so the arithmetic is done in premultiplied space and the result is
// clamped to keep alpha >= the colour it carries -- an over-bright pixel with
// alpha below its own rgb renders as a bright halo with a dark centre on some
// drivers, which is exactly the artefact this clamp exists to prevent.

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4  qt_Matrix;
    float qt_Opacity;
    float strength;
    float threshold;
};

layout(binding = 1) uniform sampler2D src;
layout(binding = 2) uniform sampler2D blurTex;

void main()
{
    vec4 sharp = texture(src, qt_TexCoord0);
    vec4 blur  = texture(blurTex, qt_TexCoord0);

    // Only the bright part of the blur is allowed to bloom. Without this the
    // background's own colour blooms into a wash and the contrast the whole
    // look depends on goes with it.
    float lum = dot(blur.rgb, vec3(0.2126, 0.7152, 0.0722));
    float keep = smoothstep(threshold, threshold + 0.25, lum);

    vec3 lit = sharp.rgb + blur.rgb * strength * keep;
    float a = max(sharp.a, max(max(lit.r, lit.g), lit.b));

    fragColor = vec4(min(lit, vec3(a)), a) * qt_Opacity;
}

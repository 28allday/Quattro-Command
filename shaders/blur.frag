#version 440

// Quattro Command -- one half of a separable gaussian blur.
//
// Run twice, horizontally then vertically, over a quarter-resolution copy of
// the play field. Two 9-tap passes at quarter res reach as far as a 33-tap
// pass at full res for a sixteenth of the samples, and the quarter-res
// downsample is itself doing part of the blurring for free.
//
// `texelStep` carries both the direction and the scale: the QML side passes
// (1/width, 0) for the horizontal pass and (0, 1/height) for the vertical, so
// one shader serves both and there is no branch in the inner loop.

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4  qt_Matrix;
    float qt_Opacity;
    vec2  texelStep;
    float radius;
};

layout(binding = 1) uniform sampler2D src;

void main()
{
    // Nine taps, gaussian-ish weights normalised to 1. Kept as literals
    // rather than computed: this runs per pixel per pass per frame.
    const float w0 = 0.2270270270;
    const float w1 = 0.1945945946;
    const float w2 = 0.1216216216;
    const float w3 = 0.0540540541;
    const float w4 = 0.0162162162;

    vec2 s = texelStep * radius;

    vec4 sum = texture(src, qt_TexCoord0) * w0;
    sum += texture(src, qt_TexCoord0 + s * 1.0) * w1;
    sum += texture(src, qt_TexCoord0 - s * 1.0) * w1;
    sum += texture(src, qt_TexCoord0 + s * 2.0) * w2;
    sum += texture(src, qt_TexCoord0 - s * 2.0) * w2;
    sum += texture(src, qt_TexCoord0 + s * 3.0) * w3;
    sum += texture(src, qt_TexCoord0 - s * 3.0) * w3;
    sum += texture(src, qt_TexCoord0 + s * 4.0) * w4;
    sum += texture(src, qt_TexCoord0 - s * 4.0) * w4;

    fragColor = sum * qt_Opacity;
}

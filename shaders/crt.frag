#version 440

// Quattro Command -- the tube.
//
// The original's README promised an F1 CRT toggle that its code never had. It
// exists now, and it is doing five separate things that all have to be subtle
// or the game becomes unreadable:
//
//   1. Barrel distortion, so the picture belongs to a curved piece of glass.
//   2. An aperture-grille mask, which is what actually sells "phosphor" -- a
//      vertical RGB stripe pattern at screen resolution. Kept shallow: at the
//      depth a still frame wants, the mask beats against the scanlines and the
//      whole picture turns into a visible dot grid.
//   3. Scanlines, tied to the field's own height rather than the window's, so
//      they do not moire when the cabinet is resized.
//   4. Chromatic aberration that grows toward the edges, because a real tube's
//      convergence is worst in the corners. Very slight: at anything more than
//      a few thousandths it stops reading as convergence error and starts
//      reading as a rendering fault, which is exactly how it looked on the HUD
//      at 0.020.
//   5. A vignette, plus a hint of noise, so the black is never flat.
//
// Everything scales off `amount`, so the QML side can fade the whole effect in
// and out with one number instead of animating five.

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4  qt_Matrix;
    float qt_Opacity;
    vec2  resolution;      // pixel size of the drawn surface
    float scanCount;       // scanlines across the height
    float amount;          // 0 = off, 1 = full
    float time;
    float curvature;
    float brightness;
};

layout(binding = 1) uniform sampler2D src;

vec2 warp(vec2 uv, float k)
{
    // Centre-relative, push outward by r^2, back to 0..1.
    vec2 c = uv * 2.0 - 1.0;
    float r2 = dot(c, c);
    c *= 1.0 + k * r2;
    return c * 0.5 + 0.5;
}

float hash(vec2 p)
{
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main()
{
    float k = curvature * amount;
    vec2 uv = warp(qt_TexCoord0, k);

    // Anything the curve pushed off the glass is outside the tube.
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        fragColor = vec4(0.0);
        return;
    }

    // ---- convergence error, worst at the corners
    vec2 fromCentre = uv - 0.5;
    float edge = dot(fromCentre, fromCentre);
    vec2 shift = fromCentre * edge * 0.007 * amount;

    vec3 colour;
    colour.r = texture(src, uv + shift).r;
    colour.g = texture(src, uv).g;
    colour.b = texture(src, uv - shift).b;
    float alpha = texture(src, uv).a;

    // ---- aperture grille: three-pixel RGB stripes, at screen resolution
    float stripe = mod(uv.x * resolution.x, 3.0);
    vec3 mask = vec3(0.94);
    if (stripe < 1.0)      mask = vec3(1.04, 0.93, 0.95);
    else if (stripe < 2.0) mask = vec3(0.95, 1.04, 0.93);
    else                   mask = vec3(0.93, 0.95, 1.04);
    colour *= mix(vec3(1.0), mask, amount);

    // ---- scanlines, keyed to the field rather than the window
    float scan = sin(uv.y * scanCount * 3.14159265) * 0.5 + 0.5;
    colour *= mix(1.0, 0.88 + 0.12 * scan, amount);

    // ---- vignette
    float vig = 1.0 - edge * 0.95;
    colour *= mix(1.0, clamp(vig, 0.0, 1.0), amount * 0.75);

    // ---- grain, so the darks are never a flat block of one value
    float n = hash(uv * resolution + time) - 0.5;
    colour += n * 0.020 * amount;

    // The mask and the scanlines both take light away, so give some back --
    // otherwise switching the CRT on reads as turning the brightness down.
    colour *= mix(1.0, brightness, amount);

    colour = max(colour, vec3(0.0));
    float a = max(alpha, max(max(colour.r, colour.g), colour.b));
    fragColor = vec4(min(colour, vec3(a)), a) * qt_Opacity;
}

#!/usr/bin/env python3
"""Render Quattro Command's sound bank to WAV.

Every sound in this game is synthesised rather than sampled. The original
generated them at load time with love.sound.newSoundData; QtMultimedia plays
files and cannot synthesise, so the synthesis happens here, once, and the
plugin ships the results.

    ./make_sounds.py            # writes *.wav next to this script

Re-run after changing a generator. The WAVs are tracked in git so a fresh
clone plays sound without Python.

Eight of the ten generators are the original's, transcribed from
audio/sounds.lua unchanged -- same waveforms, same envelopes, same durations.
The two new ones are the bonus-city jingle (the original awarded them in
silence) and the flier hum, which loops while a bomber or satellite is on
screen.
"""

import math
import os
import random
import struct
import sys
import wave

SAMPLE_RATE = 44100


def render(path, duration, generator):
    """Sample `generator(t, p)` over `duration` into a 16-bit mono WAV.

    `t` is seconds elapsed and `p` is progress 0..1, so a generator shapes both
    a waveform and its envelope from the same two numbers -- which is the
    calling convention the Lua used, kept so the generators could be moved
    across without being rewritten.
    """
    count = int(SAMPLE_RATE * duration)
    frames = bytearray()
    for i in range(count):
        value = generator(i / SAMPLE_RATE, i / count)
        value = max(-1.0, min(1.0, value))
        frames += struct.pack("<h", int(value * 32767))

    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        out.writeframes(bytes(frames))
    return count


def noise():
    return random.random() * 2 - 1


# ------------------------------------------------- the original's generators

def launch(t, p):
    # Ascending sweep. The sound of the whole game, played thirty times a wave.
    freq = 300 + p * 1200
    return math.sin(2 * math.pi * freq * t) * (1 - p) * 0.4


def explosion(t, p):
    env = (1 - p) ** 2
    sine = math.sin(2 * math.pi * (60 + 40 * (1 - p)) * t) * 0.5
    return (sine + noise() * 0.5) * env * 0.5


def impact(t, p):
    # A warhead landing on something that does not break.
    return noise() * ((1 - p) ** 4) * 0.6


def city_destroyed(t, p):
    env = (1 - p) ** 1.5
    sine = math.sin(2 * math.pi * (40 + 20 * (1 - p)) * t) * 0.6
    throb = math.sin(2 * math.pi * 25 * t) * 0.3 * env
    return (sine + noise() * 0.4 + throb) * env * 0.5


def mirv_split(t, p):
    # Short, high and downward -- audible over everything else, which is the
    # point: it is the only warning that one warhead just became three.
    freq = 2000 - p * 800
    return math.sin(2 * math.pi * freq * t) * ((1 - p) ** 2) * 0.35


def wave_start(t, p):
    freq = 800 if p < 0.5 else 1100
    env = 0.8
    if p < 0.05:
        env = p / 0.05 * 0.8
    if p > 0.9:
        env = (1 - p) / 0.1 * 0.8
    return math.sin(2 * math.pi * freq * t) * env * 0.3


def bonus_tick(t, p):
    return math.sin(2 * math.pi * 1500 * t) * ((1 - p) ** 6) * 0.4


def game_over(t, p):
    freq = 600 * (1 - p * 0.7)
    env = (1 - p) ** 0.8
    sine = math.sin(2 * math.pi * freq * t) * 0.4
    pulse = 0.7 + math.sin(2 * math.pi * 3 * t) * 0.3
    return (sine + noise() * 0.2 * p) * env * pulse * 0.5


# ------------------------------------------------------------ new generators

def bonus_city(t, p):
    """Three rising notes. Ten thousand points buys a city back and the
    original marked it with nothing at all."""
    step = int(p * 3)
    freq = (660, 880, 1320)[min(step, 2)]
    # Re-envelope each note so the jingle articulates instead of sliding.
    local = (p * 3) % 1.0
    env = (1 - local) ** 1.6
    return math.sin(2 * math.pi * freq * t) * env * 0.30


def flier_hum(t, p):
    """A low, beating drone. Loops while a bomber or satellite is crossing --
    the first audible warning that something is up there dropping more."""
    a = math.sin(2 * math.pi * 92 * t)
    b = math.sin(2 * math.pi * 97 * t)      # 5 Hz beat against the first
    return (a + b) * 0.5 * 0.22


def looped(generator, fade=0.012):
    """Wrap a generator so its ends meet.

    A looping sound is restarted end-to-end by SoundEffect, so a discontinuity
    at the seam is audible as a tick on every repeat. A short cross-fade of the
    head over the tail removes it.
    """
    def wrapped(t, p):
        value = generator(t, p)
        if p > 1 - fade:
            value *= (1 - p) / fade
        elif p < fade:
            value *= p / fade
        return value
    return wrapped


# The bank. Duration in seconds, then the generator.
BANK = {
    "launch":         (0.15, launch),
    "explosion":      (0.40, explosion),
    "impact":         (0.10, impact),
    "city_destroyed": (0.60, city_destroyed),
    "mirv_split":     (0.08, mirv_split),
    "wave_start":     (0.30, wave_start),
    "bonus_tick":     (0.05, bonus_tick),
    "bonus_city":     (0.36, bonus_city),
    "game_over":      (1.50, game_over),
    "flier_hum":      (0.40, looped(flier_hum)),
}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    random.seed(20260819)          # reproducible noise: same input, same WAVs
    total = 0
    for name, (duration, generator) in sorted(BANK.items()):
        path = os.path.join(here, name + ".wav")
        total += render(path, duration, generator)
        print("%-16s %5.2fs  %s" % (name, duration, path))
    print("%d sounds, %.2fs of audio" % (len(BANK), total / SAMPLE_RATE))
    return 0


if __name__ == "__main__":
    sys.exit(main())

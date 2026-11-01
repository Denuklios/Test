package de.funkgeraet.walkie;

import java.util.Random;

/** Stimm-Effekte beim Sender (8 kHz, blockweise, mit Gedächtnis zwischen den Blöcken). */
public final class VoiceFx {
    public static final String[] NAMES = { "Normal", "Funk", "Roboter", "Mickymaus", "Monster", "Echo" };
    public static final int NORMAL = 0, FUNK = 1, ROBOT = 2, MICKY = 3, MONSTER = 4, ECHO = 5;

    private final int mode;
    private final Random rng = new Random();
    private long n;                                  // Abtastzähler
    // Funk: Bandpass (Biquads)
    private final Biquad hp = Biquad.highpass(450, 0.8), lp = Biquad.lowpass(2600, 0.9);
    // Tonhöhe: Verzögerungsleitung
    private final float[] line = new float[4096];
    private int w;
    private double phase;
    // Echo
    private final float[] echo = new float[8000];
    private int ew;

    public VoiceFx(int mode) { this.mode = mode; }

    public void process(short[] s) {
        if (mode == NORMAL) return;
        for (int i = 0; i < s.length; i++, n++) {
            double x = s[i] / 32768.0, y;
            switch (mode) {
                case FUNK: {
                    double v = lp.run(hp.run(x)) * 3.2;
                    v = Math.tanh(v);                                         // leicht übersteuert
                    y = v * 0.8 + rng.nextGaussian() * 0.012;
                    break;
                }
                case ROBOT: {
                    double m = Math.sin(2 * Math.PI * 55 * n / Sfx.RATE);   // Ringmodulation
                    double v = x * m * 1.6;
                    line[w] = (float) v;                                   // metallischer Kammfilter
                    y = v + 0.55 * line[(w - 64 + line.length) % line.length];
                    w = (w + 1) % line.length;
                    y = Math.tanh(y * 1.2);
                    break;
                }
                case MICKY: y = pitch(x, 1.65); break;
                case MONSTER: y = Math.tanh(pitch(x, 0.62) * 1.4); break;
                case ECHO: {
                    int d1 = 1800, d2 = 3400;                                // 225 ms und 425 ms
                    double v = x + 0.5 * echo[(ew - d1 + echo.length) % echo.length] + 0.25 * echo[(ew - d2 + echo.length) % echo.length];
                    echo[ew] = (float) (x + 0.35 * echo[(ew - d1 + echo.length) % echo.length]);
                    ew = (ew + 1) % echo.length;
                    y = v * 0.8;
                    break;
                }
                default: y = x;
            }
            int o = (int) Math.round(y * 32767);
            s[i] = (short) Math.max(-32768, Math.min(32767, o));
        }
    }

    /** Tonhöhe ändern ohne Tempo zu ändern: zwei gleitende Leseköpfe mit Überblendung. */
    private double pitch(double x, double ratio) {
        final int win = 480;                       // 60 ms
        line[w] = (float) x;
        phase += (1 - ratio) / win;
        phase -= Math.floor(phase);
        double p2 = (phase + 0.5) % 1.0;
        double y = tap(phase * win) * Math.pow(Math.sin(Math.PI * phase), 2)
            + tap(p2 * win) * Math.pow(Math.sin(Math.PI * p2), 2);
        w = (w + 1) % line.length;
        return y;
    }

    private double tap(double delay) {
        double pos = w - delay - 1;
        while (pos < 0) pos += line.length;
        int i0 = (int) pos;
        double f = pos - i0;
        return line[i0 % line.length] * (1 - f) + line[(i0 + 1) % line.length] * f;
    }

    /** Einfacher Biquad-Filter (RBJ). */
    static final class Biquad {
        final double b0, b1, b2, a1, a2;
        double x1, x2, y1, y2;

        Biquad(double b0, double b1, double b2, double a0, double a1, double a2) {
            this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
        }

        static Biquad lowpass(double f, double q) {
            double w = 2 * Math.PI * f / Sfx.RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
            return new Biquad((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + a, -2 * c, 1 - a);
        }

        static Biquad highpass(double f, double q) {
            double w = 2 * Math.PI * f / Sfx.RATE, c = Math.cos(w), a = Math.sin(w) / (2 * q);
            return new Biquad((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + a, -2 * c, 1 - a);
        }

        double run(double x) {
            double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1; x1 = x; y2 = y1; y1 = y;
            return y;
        }
    }
}

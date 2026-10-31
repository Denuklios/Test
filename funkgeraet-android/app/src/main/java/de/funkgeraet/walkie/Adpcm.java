package de.funkgeraet.walkie;

/** IMA-ADPCM: 16-bit-Ton auf 4 Bit pro Abtastwert komprimieren (Sprache, 8 kHz → 32 kbit/s). */
public final class Adpcm {
    private static final int[] INDEX = { -1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8 };
    private static final int[] STEP = {
        7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97,
        107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
        876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428,
        4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350,
        22385, 24623, 27086, 29794, 32767 };

    /** Zustand des Kodierers; wird jedem Paket mitgegeben, damit jedes Paket für sich dekodierbar ist. */
    public int predictor = 0, index = 0;

    /** Kodiert samples (gerade Anzahl) in samples.length/2 Bytes. */
    public byte[] encode(short[] samples, int n) {
        byte[] out = new byte[(n + 1) / 2];
        int pred = predictor, idx = index;
        for (int i = 0; i < n; i++) {
            int step = STEP[idx];
            int diff = samples[i] - pred;
            int code = 0;
            if (diff < 0) { code = 8; diff = -diff; }
            int delta = step >> 3;
            if (diff >= step) { code |= 4; diff -= step; delta += step; }
            step >>= 1;
            if (diff >= step) { code |= 2; diff -= step; delta += step; }
            step >>= 1;
            if (diff >= step) { code |= 1; delta += step; }
            pred += (code & 8) != 0 ? -delta : delta;
            if (pred > 32767) pred = 32767; else if (pred < -32768) pred = -32768;
            idx += INDEX[code];
            if (idx < 0) idx = 0; else if (idx > 88) idx = 88;
            if ((i & 1) == 0) out[i >> 1] = (byte) code; else out[i >> 1] |= (byte) (code << 4);
        }
        predictor = pred; index = idx;
        return out;
    }

    /** Dekodiert data ab Startzustand (pred, idx) in 2*data.length Abtastwerte. */
    public static short[] decode(byte[] data, int off, int len, int pred, int idx) {
        short[] out = new short[len * 2];
        if (idx < 0) idx = 0; else if (idx > 88) idx = 88;
        for (int i = 0; i < out.length; i++) {
            int b = data[off + (i >> 1)] & 0xff;
            int code = (i & 1) == 0 ? b & 15 : b >> 4;
            int step = STEP[idx];
            int delta = step >> 3;
            if ((code & 4) != 0) delta += step;
            if ((code & 2) != 0) delta += step >> 1;
            if ((code & 1) != 0) delta += step >> 2;
            pred += (code & 8) != 0 ? -delta : delta;
            if (pred > 32767) pred = 32767; else if (pred < -32768) pred = -32768;
            idx += INDEX[code];
            if (idx < 0) idx = 0; else if (idx > 88) idx = 88;
            out[i] = (short) pred;
        }
        return out;
    }
}

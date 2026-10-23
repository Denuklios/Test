package de.obdwerkstatt.core;

/** Eine (ggf. aus mehreren CAN-Rahmen zusammengesetzte) Antwort eines Steuergeräts. */
public final class Frame {
    /** Absenderkennung: CAN-ID ("7E8", "18DAF110") bzw. Quelladresse bei älteren Protokollen. */
    public final String ecu;
    public final int[] data;

    public Frame(String ecu, int[] data) {
        this.ecu = ecu;
        this.data = data;
    }

    public int get(int i) {
        return i < data.length ? data[i] : -1;
    }

    @Override
    public String toString() {
        return ecu + ": " + Hex.join(data, 0, data.length);
    }
}

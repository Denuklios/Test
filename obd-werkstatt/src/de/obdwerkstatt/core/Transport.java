package de.obdwerkstatt.core;

import java.io.IOException;

/**
 * Byte-Kanal zum ELM327-Adapter. Unterklassen liefern empfangene Bytes über
 * {@link #onData(byte[], int)} an; gelesen wird immer bis zum Prompt-Zeichen '>'.
 */
public abstract class Transport {
    private final StringBuilder buf = new StringBuilder();
    private final Object lock = new Object();
    private volatile IOException failure;
    /** Alle bisher empfangenen Zeichen (gekürzt) – zur Fehlerdiagnose. */
    private final StringBuilder rxLog = new StringBuilder();
    private volatile int rxCount;

    public abstract void open() throws IOException;

    public abstract void close();

    protected abstract void writeBytes(byte[] data) throws IOException;

    /** Kurzbeschreibung für die Anzeige, z. B. "Bluetooth: OBDII (00:11:22:..)". */
    public abstract String describe();

    public void write(String s) throws IOException {
        if (failure != null) throw failure;
        writeBytes(s.getBytes("ISO-8859-1"));
    }

    protected void onData(byte[] data, int len) {
        synchronized (lock) {
            for (int i = 0; i < len; i++) {
                char c = (char) (data[i] & 0xFF);
                if (c != 0) buf.append(c);
                if (rxLog.length() < 200) rxLog.append(c >= 0x20 && c < 0x7F ? c : (c == '\r' ? '↵' : '·'));
            }
            rxCount += len;
            lock.notifyAll();
        }
    }

    protected void onFailure(IOException e) {
        synchronized (lock) {
            failure = e;
            lock.notifyAll();
        }
    }

    /** Anzahl empfangener Bytes seit dem Öffnen. */
    public int receivedCount() {
        return rxCount;
    }

    /** Die ersten empfangenen Zeichen, lesbar aufbereitet. */
    public String receivedText() {
        synchronized (lock) {
            return rxLog.toString();
        }
    }

    public boolean isFailed() {
        return failure != null;
    }

    /** Bisher empfangene, noch nicht gelesene Zeichen (ohne sie zu entfernen). */
    public String peek() {
        synchronized (lock) {
            return buf.toString();
        }
    }

    public void clearInput() {
        synchronized (lock) {
            buf.setLength(0);
        }
    }

    /** Liefert alles bis zum nächsten '>' oder null bei Zeitüberschreitung. */
    public String readUntilPrompt(long timeoutMs) throws IOException {
        long end = System.currentTimeMillis() + timeoutMs;
        synchronized (lock) {
            while (true) {
                int i = buf.indexOf(">");
                if (i >= 0) {
                    String r = buf.substring(0, i);
                    buf.delete(0, i + 1);
                    return r;
                }
                if (failure != null) throw failure;
                long rem = end - System.currentTimeMillis();
                if (rem <= 0) return null;
                try {
                    lock.wait(Math.min(rem, 100));
                } catch (InterruptedException e) {
                    throw new IOException("Abgebrochen");
                }
            }
        }
    }
}

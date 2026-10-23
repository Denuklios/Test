package de.obdwerkstatt.ui;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.content.Context;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

import de.obdwerkstatt.core.Transport;

/** Verbindungsarten zum ELM327: Bluetooth klassisch (SPP), Bluetooth LE und WLAN. */
@SuppressLint("MissingPermission")
public final class Transports {
    private Transports() {
    }

    static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    /** Liest einen InputStream in einem eigenen Thread. */
    abstract static class StreamTransport extends Transport {
        protected InputStream in;
        protected OutputStream out;
        private Thread reader;

        protected void startReader() {
            reader = new Thread(new Runnable() {
                @Override
                public void run() {
                    byte[] b = new byte[512];
                    try {
                        while (true) {
                            int n = in.read(b);
                            if (n < 0) throw new IOException("Verbindung vom Adapter getrennt.");
                            onData(b, n);
                        }
                    } catch (IOException e) {
                        onFailure(new IOException("Verbindung zum Adapter verloren."));
                    }
                }
            }, "obd-reader");
            reader.setDaemon(true);
            reader.start();
        }

        @Override
        protected void writeBytes(byte[] data) throws IOException {
            out.write(data);
            out.flush();
        }
    }

    // ---------------------------------------------------------------- Bluetooth klassisch

    static final class Classic extends StreamTransport {
        private final BluetoothDevice device;
        private BluetoothSocket socket;

        Classic(BluetoothDevice d) {
            device = d;
        }

        @Override
        public void open() throws IOException {
            BluetoothAdapter ad = BluetoothAdapter.getDefaultAdapter();
            if (ad != null) ad.cancelDiscovery();
            IOException first = null;
            try {
                socket = device.createRfcommSocketToServiceRecord(SPP);
                socket.connect();
            } catch (IOException e) {
                first = e;
                closeQuietly();
                try {
                    socket = device.createInsecureRfcommSocketToServiceRecord(SPP);
                    socket.connect();
                    first = null;
                } catch (IOException e2) {
                    closeQuietly();
                    try {
                        Method m = device.getClass().getMethod("createRfcommSocket", int.class);
                        socket = (BluetoothSocket) m.invoke(device, 1);
                        socket.connect();
                        first = null;
                    } catch (Exception e3) {
                        closeQuietly();
                    }
                }
            }
            if (first != null || socket == null) {
                throw new IOException("Bluetooth-Verbindung fehlgeschlagen. Ist der Adapter eingesteckt, "
                        + "die Zündung an und das Gerät gekoppelt? (" + (first != null ? first.getMessage() : "") + ")");
            }
            in = socket.getInputStream();
            out = socket.getOutputStream();
            startReader();
        }

        private void closeQuietly() {
            try {
                if (socket != null) socket.close();
            } catch (IOException ignored) {
            }
            socket = null;
        }

        @Override
        public void close() {
            closeQuietly();
        }

        @Override
        public String describe() {
            String n = device.getName();
            return "Bluetooth: " + (n == null ? device.getAddress() : n);
        }
    }

    // ---------------------------------------------------------------- WLAN

    static final class Wifi extends StreamTransport {
        private final String host;
        private final int port;
        private Socket socket;

        Wifi(String host, int port) {
            this.host = host;
            this.port = port;
        }

        @Override
        public void open() throws IOException {
            socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), 6000);
            socket.setTcpNoDelay(true);
            in = socket.getInputStream();
            out = socket.getOutputStream();
            startReader();
        }

        @Override
        public void close() {
            try {
                if (socket != null) socket.close();
            } catch (IOException ignored) {
            }
        }

        @Override
        public String describe() {
            return "WLAN: " + host + ":" + port;
        }
    }

    // ---------------------------------------------------------------- Bluetooth LE

    static final class Ble extends Transport {
        private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
        private final Context ctx;
        private final BluetoothDevice device;
        private BluetoothGatt gatt;
        private BluetoothGattCharacteristic rx, tx;
        private final CountDownLatch ready = new CountDownLatch(1);
        private final Semaphore writeDone = new Semaphore(0);
        private volatile String error;

        Ble(Context c, BluetoothDevice d) {
            ctx = c.getApplicationContext();
            device = d;
        }

        private final BluetoothGattCallback cb = new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    g.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                    error = "Bluetooth-LE-Verbindung getrennt (Status " + status + ").";
                    ready.countDown();
                    onFailure(new IOException(error));
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt g, int status) {
                if (!pickCharacteristics(g)) {
                    error = "Keine passende Datenschnittstelle (Schreiben + Benachrichtigung) gefunden.";
                    ready.countDown();
                    return;
                }
                g.setCharacteristicNotification(rx, true);
                BluetoothGattDescriptor d = rx.getDescriptor(CCCD);
                if (d != null) {
                    boolean indicate = (rx.getProperties() & BluetoothGattCharacteristic.PROPERTY_NOTIFY) == 0;
                    d.setValue(indicate ? BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                            : BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                    if (!g.writeDescriptor(d)) ready.countDown();
                } else {
                    ready.countDown();
                }
            }

            @Override
            public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
                ready.countDown();
            }

            @Override
            public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
                writeDone.release();
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
                byte[] v = c.getValue();
                if (v != null) onData(v, v.length);
            }

            // Ab Android 13 wird diese Variante aufgerufen
            @SuppressWarnings("unused")
            public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] v) {
                if (v != null) onData(v, v.length);
            }
        };

        /** Sucht ein Paar aus Benachrichtigungs- und Schreib-Merkmal im selben Dienst. */
        private boolean pickCharacteristics(BluetoothGatt g) {
            String[] preferred = {"0000fff0", "0000ffe0", "000018f0", "e7810a71", "0000ae30", "49535343"};
            for (String pref : preferred) {
                for (BluetoothGattService s : g.getServices()) {
                    if (s.getUuid().toString().startsWith(pref) && pickIn(s)) return true;
                }
            }
            for (BluetoothGattService s : g.getServices()) {
                String u = s.getUuid().toString();
                if (u.startsWith("00001800") || u.startsWith("00001801") || u.startsWith("0000180a")) continue;
                if (pickIn(s)) return true;
            }
            return false;
        }

        private boolean pickIn(BluetoothGattService s) {
            BluetoothGattCharacteristic n = null, w = null;
            for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                int p = c.getProperties();
                if (n == null && (p & (BluetoothGattCharacteristic.PROPERTY_NOTIFY
                        | BluetoothGattCharacteristic.PROPERTY_INDICATE)) != 0) n = c;
                if (w == null && (p & (BluetoothGattCharacteristic.PROPERTY_WRITE
                        | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0) w = c;
            }
            if (n == null || w == null) return false;
            rx = n;
            tx = w;
            return true;
        }

        @Override
        public void open() throws IOException {
            gatt = device.connectGatt(ctx, false, cb, BluetoothDevice.TRANSPORT_LE);
            try {
                if (!ready.await(20, TimeUnit.SECONDS)) error = "Zeitüberschreitung beim Verbinden (Bluetooth LE).";
            } catch (InterruptedException e) {
                error = "Abgebrochen";
            }
            if (error != null || tx == null) {
                close();
                throw new IOException(error != null ? error : "Bluetooth-LE-Verbindung fehlgeschlagen.");
            }
            try {
                Thread.sleep(300);
            } catch (InterruptedException ignored) {
            }
        }

        @Override
        protected void writeBytes(byte[] data) throws IOException {
            boolean withResponse = (tx.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
            tx.setWriteType(withResponse ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                    : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
            for (int off = 0; off < data.length; off += 20) {
                int n = Math.min(20, data.length - off);
                byte[] chunk = new byte[n];
                System.arraycopy(data, off, chunk, 0, n);
                writeDone.drainPermits();
                tx.setValue(chunk);
                boolean ok = false;
                for (int i = 0; i < 5 && !ok; i++) {
                    ok = gatt.writeCharacteristic(tx);
                    if (!ok) sleep(20);
                }
                if (!ok) throw new IOException("Schreiben über Bluetooth LE fehlgeschlagen.");
                try {
                    writeDone.tryAcquire(withResponse ? 1000 : 150, TimeUnit.MILLISECONDS);
                } catch (InterruptedException e) {
                    throw new IOException("Abgebrochen");
                }
            }
        }

        private static void sleep(long ms) {
            try {
                Thread.sleep(ms);
            } catch (InterruptedException ignored) {
            }
        }

        @Override
        public void close() {
            if (gatt != null) {
                try {
                    gatt.disconnect();
                    gatt.close();
                } catch (Exception ignored) {
                }
                gatt = null;
            }
        }

        @Override
        public String describe() {
            String n = device.getName();
            return "Bluetooth LE: " + (n == null ? device.getAddress() : n);
        }
    }
}

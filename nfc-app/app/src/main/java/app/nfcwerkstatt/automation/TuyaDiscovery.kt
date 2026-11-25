package app.nfcwerkstatt.automation

import android.content.Context
import android.net.wifi.WifiManager
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketTimeoutException

data class TuyaFound(val id: String, val ip: String, val version: String)

/** Findet Tuya-Geräte im WLAN über ihre UDP-Broadcasts (Ports 6666, 6667, 7000). */
object TuyaDiscovery {

    fun scan(ctx: Context, seconds: Int = 8): List<TuyaFound> {
        val wifi = ctx.applicationContext.getSystemService(WifiManager::class.java)
        val lock = wifi.createMulticastLock("tuya-scan").apply { setReferenceCounted(false); acquire() }
        val found = java.util.concurrent.ConcurrentHashMap<String, TuyaFound>()
        val sockets = listOf(6666, 6667, 7000).mapNotNull { port ->
            runCatching {
                DatagramSocket(null).apply {
                    reuseAddress = true; broadcast = true; soTimeout = 500
                    bind(InetSocketAddress(port))
                }
            }.getOrNull()
        }
        try {
            // v3.5-Geräte melden sich erst auf Anfrage
            runCatching {
                val myIp = localIp(wifi)
                val req = TuyaProtocol.discoveryRequest(myIp)
                DatagramSocket().use { s ->
                    s.broadcast = true
                    s.send(DatagramPacket(req, req.size, InetAddress.getByName("255.255.255.255"), 7000))
                }
            }
            val threads = sockets.map { s ->
                Thread {
                    val end = System.currentTimeMillis() + seconds * 1000L
                    val buf = ByteArray(2048)
                    while (System.currentTimeMillis() < end) {
                        val p = DatagramPacket(buf, buf.size)
                        try { s.receive(p) } catch (_: SocketTimeoutException) { continue } catch (_: Exception) { break }
                        val text = TuyaProtocol.decryptUdp(p.data.copyOf(p.length)) ?: continue
                        runCatching {
                            val j = JSONObject(text)
                            val id = j.optString("gwId").ifBlank { j.optString("id") }
                            if (id.isNotBlank() && j.has("ip")) {
                                found[id] = TuyaFound(id, j.getString("ip"), j.optString("version", "3.3"))
                            }
                        }
                    }
                }.apply { start() }
            }
            threads.forEach { it.join() }
        } finally {
            sockets.forEach { runCatching { it.close() } }
            runCatching { lock.release() }
        }
        return found.values.toList()
    }

    @Suppress("DEPRECATION")
    private fun localIp(w: WifiManager): String {
        val ip = w.connectionInfo.ipAddress
        return "%d.%d.%d.%d".format(ip and 0xff, ip shr 8 and 0xff, ip shr 16 and 0xff, ip shr 24 and 0xff)
    }
}

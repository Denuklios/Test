package de.fotobox.app

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.File
import java.util.UUID

/** Selbst ausgewählte/geteilte Dateien werden erst ins App-Verzeichnis kopiert und dann hochgeladen. */
object FileQueue {
    fun dir(ctx: Context) = File(ctx.filesDir, "queue").apply { mkdirs() }

    fun add(ctx: Context, uris: List<Uri>): Int {
        var n = 0
        for (uri in uris) {
            try {
                val name = displayName(ctx, uri)
                val slot = File(dir(ctx), UUID.randomUUID().toString()).apply { mkdirs() }
                ctx.contentResolver.openInputStream(uri)?.use { inp ->
                    File(slot, name).outputStream().use { inp.copyTo(it) }
                    n++
                } ?: slot.delete()
            } catch (_: Exception) { }
        }
        return n
    }

    fun pending(ctx: Context): List<File> =
        dir(ctx).listFiles()?.flatMap { it.listFiles()?.toList() ?: emptyList() }?.sortedBy { it.lastModified() } ?: emptyList()

    private fun displayName(ctx: Context, uri: Uri): String {
        var name: String? = null
        try {
            ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
                if (it.moveToFirst()) name = it.getString(0)
            }
        } catch (_: Exception) { }
        val n = (name ?: uri.lastPathSegment ?: "datei").substringAfterLast('/')
        return n.replace(Regex("[\\\\:*?\"<>|]"), "_").ifBlank { "datei" }
    }
}

package de.fotobox.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/** Merkt sich, welche Fotos/Videos schon auf dem Server sind. */
class UploadedDb(ctx: Context) : SQLiteOpenHelper(ctx, "uploaded.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE done (key TEXT PRIMARY KEY, remote TEXT, at INTEGER)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    fun has(key: String): Boolean =
        readableDatabase.rawQuery("SELECT 1 FROM done WHERE key=?", arrayOf(key)).use { it.moveToFirst() }

    fun add(key: String, remote: String) {
        writableDatabase.insertWithOnConflict("done", null, ContentValues().apply {
            put("key", key); put("remote", remote); put("at", System.currentTimeMillis())
        }, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun count(): Long = readableDatabase.rawQuery("SELECT COUNT(*) FROM done", null).use {
        it.moveToFirst(); it.getLong(0)
    }

    fun clear() = writableDatabase.delete("done", null, null)
}

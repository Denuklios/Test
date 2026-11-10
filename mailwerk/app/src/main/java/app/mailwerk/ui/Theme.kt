package app.mailwerk.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import app.mailwerk.data.ThemeMode

private val Light = lightColorScheme(primary = Color(0xFF2557D6), secondary = Color(0xFF5B5F71), tertiary = Color(0xFFE8710A))
private val Dark = darkColorScheme(primary = Color(0xFFB3C5FF), secondary = Color(0xFFC3C6DB), tertiary = Color(0xFFFFB77C))

@Composable
fun isDark(mode: ThemeMode) = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.LIGHT -> false; ThemeMode.DARK -> true }

@Composable
fun MailwerkTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = isDark(mode)
    val ctx = LocalContext.current
    // Material You: Farben passen sich dem Hintergrundbild an (Android 12+)
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        dark -> Dark
        else -> Light
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

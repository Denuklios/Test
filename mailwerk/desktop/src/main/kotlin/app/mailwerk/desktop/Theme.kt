package app.mailwerk.desktop

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.platform.Font

/** Markenfarben wie in der Handy-App */
object Brand {
    val Indigo = Color(0xFF3D4FE0)
    val Violet = Color(0xFF7B5CF5)
    val People = Color(0xFF3D4FE0)
    val News = Color(0xFFE0751F)
    val Notify = Color(0xFF14946B)
    val gradient = Brush.linearGradient(listOf(Color(0xFF4F63F5), Color(0xFF7B5CF5)))
}

private val Light = lightColorScheme(
    primary = Brand.Indigo, onPrimary = Color.White,
    primaryContainer = Color(0xFFE2E5FF), onPrimaryContainer = Color(0xFF0F1A6B),
    secondaryContainer = Color(0xFFE6E8F5), onSecondaryContainer = Color(0xFF1B1F38),
    tertiary = Color(0xFFC77700), tertiaryContainer = Color(0xFFFFE6BF),
    background = Color(0xFFF7F8FC), onBackground = Color(0xFF151827),
    surface = Color(0xFFF7F8FC), onSurface = Color(0xFF151827),
    surfaceVariant = Color(0xFFE4E6F0), onSurfaceVariant = Color(0xFF5D6178),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color.White,
    surfaceContainer = Color(0xFFF0F1F8), surfaceContainerHigh = Color(0xFFEAECF5), surfaceContainerHighest = Color(0xFFE3E5F0),
    outline = Color(0xFFB9BCCD), outlineVariant = Color(0xFFE1E3EE), error = Color(0xFFD93A3A),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFAFB8FF), onPrimary = Color(0xFF0F1A6B),
    primaryContainer = Color(0xFF2D3AA8), onPrimaryContainer = Color(0xFFE2E5FF),
    secondaryContainer = Color(0xFF33374F), onSecondaryContainer = Color(0xFFE2E4F5),
    tertiary = Color(0xFFFFC266), tertiaryContainer = Color(0xFF5A3A00),
    background = Color(0xFF0B0C12), onBackground = Color(0xFFECEDF5),
    surface = Color(0xFF0B0C12), onSurface = Color(0xFFECEDF5),
    surfaceVariant = Color(0xFF2C3146), onSurfaceVariant = Color(0xFFA3A8BF),
    surfaceContainerLowest = Color(0xFF0E1018), surfaceContainerLow = Color(0xFF161925),
    surfaceContainer = Color(0xFF1C2030), surfaceContainerHigh = Color(0xFF282E45), surfaceContainerHighest = Color(0xFF343B56),
    outline = Color(0xFF5A6080), outlineVariant = Color(0xFF353A52), error = Color(0xFFFF8A80),
)

val Jakarta = FontFamily(
    Font("font/jakarta_regular.ttf", FontWeight.Normal), Font("font/jakarta_medium.ttf", FontWeight.Medium),
    Font("font/jakarta_semibold.ttf", FontWeight.SemiBold), Font("font/jakarta_bold.ttf", FontWeight.Bold),
    Font("font/jakarta_extrabold.ttf", FontWeight.ExtraBold),
)

private fun Typography.withFont(f: FontFamily): Typography {
    fun TextStyle.f() = copy(fontFamily = f)
    return copy(displayLarge.f(), displayMedium.f(), displaySmall.f(), headlineLarge.f(), headlineMedium.f(), headlineSmall.f(),
        titleLarge.f(), titleMedium.f(), titleSmall.f(), bodyLarge.f(), bodyMedium.f(), bodySmall.f(), labelLarge.f(), labelMedium.f(), labelSmall.f())
}

/** Windows: „Apps im dunklen Modus“ aus der Registrierung lesen */
fun windowsPrefersDark(): Boolean = runCatching {
    if (!Paths.isWindows) return false
    com.sun.jna.platform.win32.Advapi32Util.registryGetIntValue(com.sun.jna.platform.win32.WinReg.HKEY_CURRENT_USER,
        "Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize", "AppsUseLightTheme") == 0
}.getOrDefault(false)

@Composable
fun MailwerkTheme(dark: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Typography().withFont(Jakarta), content = content)
}

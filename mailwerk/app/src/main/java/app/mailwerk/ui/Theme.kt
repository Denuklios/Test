package app.mailwerk.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.mailwerk.R
import app.mailwerk.data.ThemeMode

val Jakarta = FontFamily(
    Font(R.font.jakarta_regular, FontWeight.Normal),
    Font(R.font.jakarta_medium, FontWeight.Medium),
    Font(R.font.jakarta_semibold, FontWeight.SemiBold),
    Font(R.font.jakarta_bold, FontWeight.Bold),
    Font(R.font.jakarta_extrabold, FontWeight.ExtraBold),
)

/** Markenfarben: tiefes Indigo + warmes Bernstein. */
object Brand {
    val Indigo = Color(0xFF3D4FE0)
    val IndigoDeep = Color(0xFF2433A8)
    val Violet = Color(0xFF7B5CF5)
    val Amber = Color(0xFFFFB020)
    val People = Color(0xFF3D4FE0)
    val News = Color(0xFFE0751F)
    val Notify = Color(0xFF14946B)
    val gradient = Brush.linearGradient(listOf(Color(0xFF4F63F5), Color(0xFF7B5CF5)))
    val gradientDeep = Brush.linearGradient(listOf(Color(0xFF2433A8), Color(0xFF5B3FD6)))
}

private val Light = lightColorScheme(
    primary = Brand.Indigo, onPrimary = Color.White,
    primaryContainer = Color(0xFFE2E5FF), onPrimaryContainer = Color(0xFF0F1A6B),
    secondary = Color(0xFF5B6080), secondaryContainer = Color(0xFFE6E8F5), onSecondaryContainer = Color(0xFF1B1F38),
    tertiary = Color(0xFFC77700), tertiaryContainer = Color(0xFFFFE6BF), onTertiaryContainer = Color(0xFF3D2500),
    background = Color(0xFFF7F8FC), onBackground = Color(0xFF151827),
    surface = Color(0xFFF7F8FC), onSurface = Color(0xFF151827),
    surfaceVariant = Color(0xFFE4E6F0), onSurfaceVariant = Color(0xFF5D6178),
    surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFFFFFFF),
    surfaceContainer = Color(0xFFF0F1F8), surfaceContainerHigh = Color(0xFFEAECF5), surfaceContainerHighest = Color(0xFFE3E5F0),
    outline = Color(0xFFB9BCCD), outlineVariant = Color(0xFFE1E3EE),
    error = Color(0xFFD93A3A), errorContainer = Color(0xFFFFE2E0),
)

private val Dark = darkColorScheme(
    primary = Color(0xFFAFB8FF), onPrimary = Color(0xFF0F1A6B),
    primaryContainer = Color(0xFF2D3AA8), onPrimaryContainer = Color(0xFFE2E5FF),
    secondary = Color(0xFFC3C6DE), secondaryContainer = Color(0xFF33374F), onSecondaryContainer = Color(0xFFE2E4F5),
    tertiary = Color(0xFFFFC266), tertiaryContainer = Color(0xFF5A3A00), onTertiaryContainer = Color(0xFFFFE6BF),
    // Dunkelmodus mit deutlichen Stufen: Hintergrund fast schwarz, Karten klar abgesetzt
    background = Color(0xFF08090E), onBackground = Color(0xFFECEDF5),
    surface = Color(0xFF08090E), onSurface = Color(0xFFECEDF5),
    surfaceVariant = Color(0xFF2C3146), onSurfaceVariant = Color(0xFFA3A8BF),
    surfaceContainerLowest = Color(0xFF0E1018), surfaceContainerLow = Color(0xFF161925),
    surfaceContainer = Color(0xFF1C2030), surfaceContainerHigh = Color(0xFF282E45), surfaceContainerHighest = Color(0xFF343B56),
    outline = Color(0xFF555C7A), outlineVariant = Color(0xFF2E3448),
)

private fun t(size: Int, weight: FontWeight, line: Int, ls: Double = 0.0) =
    TextStyle(fontFamily = Jakarta, fontSize = size.sp, fontWeight = weight, lineHeight = line.sp, letterSpacing = ls.sp)

val AppTypography = Typography(
    displayLarge = t(52, FontWeight.ExtraBold, 60, -1.0), displayMedium = t(42, FontWeight.ExtraBold, 50, -0.8),
    displaySmall = t(34, FontWeight.Bold, 42, -0.5),
    headlineLarge = t(30, FontWeight.ExtraBold, 38, -0.6), headlineMedium = t(26, FontWeight.ExtraBold, 34, -0.5),
    headlineSmall = t(22, FontWeight.Bold, 30, -0.3),
    titleLarge = t(20, FontWeight.Bold, 28, -0.2), titleMedium = t(16, FontWeight.SemiBold, 22), titleSmall = t(14, FontWeight.SemiBold, 20),
    bodyLarge = t(16, FontWeight.Normal, 24), bodyMedium = t(14, FontWeight.Normal, 20), bodySmall = t(13, FontWeight.Normal, 18),
    labelLarge = t(14, FontWeight.SemiBold, 20), labelMedium = t(12, FontWeight.SemiBold, 16), labelSmall = t(11, FontWeight.Medium, 14, 0.2),
)

val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(18.dp),
    large = RoundedCornerShape(24.dp), extraLarge = RoundedCornerShape(32.dp),
)

@Composable
fun isDark(mode: ThemeMode) = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.LIGHT -> false; ThemeMode.DARK -> true }

@Composable
fun MailwerkTheme(mode: ThemeMode, dynamic: Boolean = false, content: @Composable () -> Unit) {
    val dark = isDark(mode)
    val ctx = LocalContext.current
    val scheme = when {
        dynamic && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        dark -> Dark
        else -> Light
    }
    MaterialTheme(colorScheme = scheme, typography = AppTypography, shapes = AppShapes, content = content)
}

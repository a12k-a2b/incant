package app.incant.dc1

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("incant_grimoire")

data class IncantSettings(
    val openaiKey: String = "",
    val geminiKey: String = "",
    val fourfold: Boolean = false,
    val livePaper: Boolean = true,
    val quality: String = "medium",
    val model: String = "gpt-image-2.5-flare",
)

class SettingsStore(private val context: Context) {
    private val openai = stringPreferencesKey("openai")
    private val gemini = stringPreferencesKey("gemini")
    private val fourfold = booleanPreferencesKey("fourfold")
    private val livePaper = booleanPreferencesKey("live_paper")
    private val quality = stringPreferencesKey("quality")
    private val model = stringPreferencesKey("model")

    val settings: Flow<IncantSettings> = context.dataStore.data.map { prefs ->
        IncantSettings(
            openaiKey = prefs[openai].orEmpty(),
            geminiKey = prefs[gemini].orEmpty(),
            fourfold = prefs[fourfold] ?: false,
            livePaper = prefs[livePaper] ?: true,
            quality = prefs[quality] ?: "medium",
            model = prefs[model] ?: "gpt-image-2.5-flare",
        )
    }

    suspend fun save(next: IncantSettings) {
        context.dataStore.edit { prefs ->
            prefs[openai] = next.openaiKey
            prefs[gemini] = next.geminiKey
            prefs[fourfold] = next.fourfold
            prefs[livePaper] = next.livePaper
            prefs[quality] = next.quality
            prefs[model] = next.model
        }
    }
}

package app.incant.dc1

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class OpenAiCast(
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(180, TimeUnit.SECONDS)
        .build(),
) {
    data class Result(val ok: Boolean, val imagePng: ByteArray? = null, val error: String? = null)

    fun edit(
        apiKey: String,
        sketchPng: ByteArray,
        incantation: String,
        livePaper: Boolean,
        variationIndex: Int,
        quality: String,
        model: String,
    ): Result {
        val prompt = buildPrompt(incantation, livePaper, variationIndex)
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("model", model)
            .addFormDataPart("prompt", prompt)
            .addFormDataPart("size", "1024x1536")
            .addFormDataPart("quality", quality)
            .addFormDataPart(
                "image",
                "sketch.png",
                sketchPng.toRequestBody("image/png".toMediaType()),
            )
            .build()

        val request = Request.Builder()
            .url("https://api.openai.com/v1/images/edits")
            .header("Authorization", "Bearer $apiKey")
            .post(body)
            .build()

        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(text) }.getOrNull()
            if (!response.isSuccessful) {
                val message = json?.optJSONObject("error")?.optString("message")
                    ?: "The spell was refused (${response.code})."
                return Result(false, error = message)
            }
            val b64 = json?.optJSONArray("data")
                ?.optJSONObject(0)
                ?.optString("b64_json")
                .orEmpty()
            if (b64.isBlank()) return Result(false, error = "OpenAI returned no image.")
            return Result(true, imagePng = android.util.Base64.decode(b64, android.util.Base64.DEFAULT))
        }
    }

    private fun buildPrompt(incantation: String, livePaper: Boolean, variation: Int): String {
        val shifts = listOf(
            "",
            "Create a distinct variation: shift the lighting and time of day, keeping the same composition.",
            "Create a distinct variation: change materials and surface texture, keeping the same composition.",
            "Create a distinct variation: alter the mood and atmosphere, keeping the same composition.",
        )
        val parts = mutableListOf(
            "Turn this drawing into a complete, finished image.",
            "Preserve the exact layout, proportions, perspective, and placement of every element in the sketch.",
            "Treat the sketch as the compositional guide — do not invent new major subjects or rearrange the scene.",
            if (incantation.isBlank()) {
                "Interpret the sketch faithfully. Choose plausible materials, lighting, and environment consistent with the drawing."
            } else {
                "The caster's spell (follow this for style, setting, materials, lighting, and extra detail):\n\"\"\"$incantation\"\"\""
            },
            "Do not add text, watermarks, captions, or UI unless the spell explicitly asks for lettering.",
        )
        if (livePaper) {
            parts += "Compose with strong value contrast, clear silhouettes, and readable shapes so the image holds up on a reflective grayscale display. Avoid relying on hue alone to separate forms."
        }
        val shift = shifts.getOrElse(variation) { shifts[1] }
        if (shift.isNotBlank()) parts += shift
        return parts.joinToString("\n")
    }
}

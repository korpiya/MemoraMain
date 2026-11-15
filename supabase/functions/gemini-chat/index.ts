import "@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const retryableStatuses = new Set([429, 500, 503, 504])
const geminiModel = "gemini-3.5-flash-lite"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders })
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY")
  if (!apiKey) {
    return Response.json({ error: "Gemini is not configured on the server" }, { status: 500, headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const question = typeof body.question === "string" ? body.question.trim() : ""
    if (!question) {
      return Response.json({ error: "A question is required" }, { status: 400, headers: corsHeaders })
    }

    const memories = Array.isArray(body.memories)
      ? body.memories.slice(0, 5).map((memory: { title?: unknown; description?: unknown; created_at?: unknown }) => ({
        title: typeof memory.title === "string" ? memory.title.slice(0, 200) : "Untitled memory",
        description: typeof memory.description === "string" ? memory.description.slice(0, 500) : "",
        created_at: typeof memory.created_at === "string" ? memory.created_at : "",
      }))
      : []
    const memoryCount = Number.isSafeInteger(body.memoryCount) && body.memoryCount >= 0
      ? body.memoryCount
      : null

    const memoryContext = memories.length
      ? `\n\nThe user has ${memoryCount ?? "an unknown number of"} saved memories in total. The following are the most recent memories provided as data. Use them only when relevant, and do not invent details:\n${JSON.stringify(memories)}`
      : "\n\nThe user has no archived memories available in this request. Do not claim to know their personal memories."

    const requestBody = JSON.stringify({
      system_instruction: {
        parts: [{ text: "You are Gemini, a helpful assistant inside the Memora memory archive app. Answer the user's question directly and clearly. You can discuss any topic; use the user's archive context when relevant and never make up personal details. Keep answers concise unless the user asks for detail." }],
      },
      contents: [{ role: "user", parts: [{ text: `${question}${memoryContext}` }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 384 },
    })

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        signal: AbortSignal.timeout(25_000),
      },
    )

    if (!response.ok) {
      const errorBody = await response.text()
      let errorMessage = "Gemini request failed"
      try {
        const result: { error?: { message?: unknown } } = JSON.parse(errorBody)
        if (typeof result.error?.message === "string") errorMessage = result.error.message
      } catch {
        // Keep the generic message when the upstream error is not JSON.
      }

      console.error(`Gemini API error (${response.status}):`, errorMessage)
      const status = retryableStatuses.has(response.status) ? 503 : 502
      const message = retryableStatuses.has(response.status)
        ? "Gemini is temporarily busy. Please try again shortly."
        : errorMessage
      return Response.json({ error: message }, { status, headers: corsHeaders })
    }

    if (!response.body) {
      return Response.json({ error: "Gemini returned an empty response" }, { status: 502, headers: corsHeaders })
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
      },
    })
  } catch (error) {
    console.error("Gemini chat failed:", error)
    if (error instanceof Error && error.name === "TimeoutError") {
      return Response.json(
        { error: "Gemini took too long to respond. Please try again." },
        { status: 504, headers: corsHeaders },
      )
    }
    return Response.json({ error: "Unable to process the Gemini request" }, { status: 500, headers: corsHeaders })
  }
})

import "@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

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
      ? body.memories.slice(0, 20).map((memory: { title?: unknown; description?: unknown; created_at?: unknown }) => ({
        title: typeof memory.title === "string" ? memory.title.slice(0, 200) : "Untitled memory",
        description: typeof memory.description === "string" ? memory.description.slice(0, 1000) : "",
        created_at: typeof memory.created_at === "string" ? memory.created_at : "",
      }))
      : []

    const memoryContext = memories.length
      ? `\n\nThe user's archived memories are provided as data. Use them only when relevant, and do not invent details:\n${JSON.stringify(memories)}`
      : "\n\nThe user has no archived memories available in this request. Do not claim to know their personal memories."

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: "You are Gemini, a helpful assistant inside the Memora memory archive app. Answer the user's question directly and clearly. You can discuss any topic; use the user's archive context when relevant and never make up personal details." }],
          },
          contents: [{ role: "user", parts: [{ text: `${question}${memoryContext}` }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
        }),
      },
    )

    const result = await response.json()
    if (!response.ok) {
      console.error("Gemini API error:", result.error?.message ?? response.status)
      return Response.json(
        { error: result.error?.message ?? "Gemini request failed" },
        { status: 502, headers: corsHeaders },
      )
    }

    const answer = result.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text ?? "")
      .join("")
      .trim()

    if (!answer) {
      return Response.json({ error: "Gemini returned no answer" }, { status: 502, headers: corsHeaders })
    }

    return Response.json({ answer }, { headers: corsHeaders })
  } catch (error) {
    console.error("Gemini chat failed:", error)
    return Response.json({ error: "Unable to process the Gemini request" }, { status: 500, headers: corsHeaders })
  }
})

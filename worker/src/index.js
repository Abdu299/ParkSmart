const SYSTEM_PROMPT = `Du er ParkSmart AI, en kortfattet parkeringsassistent for Oslo.

Regler du alltid må følge:
1. Svar på norsk med enkelt og tydelig språk.
2. For nærmeste parkering, pris, åpningstid, makstid og tilgjengelige fasiliteter skal du bare bruke PARKERINGSDATA som følger med forespørselen. Aldri finn på steder, priser eller regler.
3. Bruk bare parkerings-ID-er som finnes i PARKERINGSDATA når du fyller parkingIds. Velg maksimalt tre relevante steder, nærmest først.
4. Hvis PARKERINGSDATA mangler eller ikke er nok, si tydelig hva som mangler.
5. Når et bilde er vedlagt, forklar hvilke parkeringsskilt og underskilt du kan se, hvordan kombinasjonen vanligvis leses, og si tydelig hvis bildet er uklart eller deler av skiltet mangler.
6. Ikke påstå at en plass er ledig. ParkSmart har ikke sanntidsbelegg.
7. Ikke gi skråsikre juridiske konklusjoner. Opplys at skiltingen på stedet og midlertidig skilting gjelder.
8. Ikke bruk Google Maps eller andre eksterne data som fasit for ParkSmart-plasser.
9. Hold svaret under 180 ord med mindre brukeren ber om mer detalj.
10. Når spørsmålet gjelder et skilt eller et bilde er vedlagt, skal parkingIds være tom. Fyll signCode med det offisielle norske skiltnummeret, for eksempel "372", når skiltet kan identifiseres. Bruk tom tekst hvis du ikke er sikker.

Returner bare JSON som følger skjemaet.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Det norske svaret til brukeren.' },
    parkingIds: {
      type: 'array',
      description: 'Null til tre relevante ID-er, kun fra PARKERINGSDATA.',
      items: { type: 'string' }
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: 'Sikkerhet i svaret, særlig ved bildetolkning.'
    },
    signCode: {
      type: 'string',
      description: 'Offisielt norsk skiltnummer, for eksempel 372. Tom tekst hvis ukjent.'
    }
  },
  required: ['answer', 'parkingIds', 'confidence', 'signCode']
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
    if (!role || typeof item.text !== 'string') return [];
    return [{ role, text: item.text.slice(0, 1500) }];
  });
}

function sanitizeParking(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap(place => {
    if (!place || typeof place !== 'object' || typeof place.id !== 'string') return [];
    return [{
      id: place.id.slice(0, 160),
      name: String(place.name || '').slice(0, 200),
      address: String(place.address || '').slice(0, 240),
      type: String(place.type || '').slice(0, 40),
      distanceMeters: Number.isFinite(place.distanceMeters) ? Math.max(0, Math.round(place.distanceMeters)) : null,
      status: String(place.status || '').slice(0, 160),
      statusDetail: String(place.statusDetail || '').slice(0, 500),
      isFreeNow: typeof place.isFreeNow === 'boolean' ? place.isFreeNow : null,
      payment: String(place.payment || '').slice(0, 40),
      maxStay: place.maxStay ? String(place.maxStay).slice(0, 120) : null,
      feeHours: place.feeHours ? String(place.feeHours).slice(0, 200) : null,
      regular: place.regular ? String(place.regular).slice(0, 500) : null,
      electric: place.electric ? String(place.electric).slice(0, 500) : null,
      chargingSpaces: Number.isFinite(place.chargingSpaces) ? place.chargingSpaces : 0,
      hcSpaces: Number.isFinite(place.hcSpaces) ? place.hcSpaces : 0,
      source: String(place.source || '').slice(0, 80),
      fetchedAt: String(place.fetchedAt || '').slice(0, 30)
    }];
  });
}

function parseImage(dataUrl) {
  if (dataUrl == null) return null;
  if (typeof dataUrl !== 'string' || dataUrl.length > 4_500_000) throw new Error('Bildet er for stort. Velg et mindre bilde.');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('Bildet må være JPG, PNG eller WebP.');
  return { mimeType: match[1], data: match[2] };
}

function parseModelJson(text) {
  const clean = text.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  const result = JSON.parse(clean);
  if (!result || typeof result.answer !== 'string') throw new Error('Ugyldig AI-svar.');
  return result;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function requestGemini(env, model, payload) {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
        'Api-Revision': '2026-05-20'
      },
      body: JSON.stringify({ ...payload, model }),
      signal: AbortSignal.timeout(7000)
    });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  } catch {
    return {
      response: new Response(null, { status: 503 }),
      body: { error: { message: 'Upstream unavailable' } }
    };
  }
}

async function requestWithFallback(env, payload) {
  const primary = env.GEMINI_MODEL || 'gemini-3.8-flash';
  const fallback = env.GEMINI_FALLBACK_MODEL || 'gemini-3.6-flash';
  const models = [primary, fallback];
  let lastResult;

  for (let index = 0; index < models.length; index += 1) {
    if (index === 1) await wait(250);
    lastResult = await requestGemini(env, models[index], payload);
    if (lastResult.response.ok || !RETRYABLE_STATUSES.has(lastResult.response.status)) return lastResult;
  }
  return lastResult;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({}, 204);
    if (request.method !== 'POST') return json({ error: 'Bruk POST.' }, 405);
    if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY mangler i Worker secrets.' }, 503);

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 5_000_000) return json({ error: 'Forespørselen er for stor.' }, 413);

    try {
      const body = await request.json();
      const question = typeof body.question === 'string' ? body.question.trim().slice(0, 500) : '';
      if (!question) return json({ error: 'Spørsmålet mangler.' }, 400);
      const history = sanitizeHistory(body.history);
      const parking = sanitizeParking(body.parking);
      const image = parseImage(body.imageDataUrl);
      const location = Number.isFinite(body.latitude) && Number.isFinite(body.longitude)
        ? { latitude: body.latitude, longitude: body.longitude }
        : null;

      const context = [
        'BRUKERSPØRSMÅL:\n' + question,
        'BRUKERPOSISJON:\n' + JSON.stringify(location),
        'SAMTALEHISTORIKK:\n' + JSON.stringify(history),
        'PARKERINGSDATA (sortert nærmest først):\n' + JSON.stringify(parking)
      ].join('\n\n');
      const input = [{ type: 'text', text: context }];
      if (image) input.push({ type: 'image', data: image.data, mime_type: image.mimeType });

      const { response: upstream, body: upstreamBody } = await requestWithFallback(env, {
        input,
        store: false,
        system_instruction: SYSTEM_PROMPT,
        generation_config: {
          temperature: 0.2,
          max_output_tokens: 900
        },
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: RESPONSE_SCHEMA
        }
      });
      if (!upstream.ok) {
        if (upstream.status === 429) return json({ error: 'Gratis AI-kvote er midlertidig brukt opp. Vent litt og prøv igjen.' }, 429);
        if (RETRYABLE_STATUSES.has(upstream.status)) return json({ error: 'AI-tjenesten er midlertidig opptatt. Vent litt og prøv igjen.' }, 503);
        return json({ error: 'AI-tjenesten kunne ikke behandle spørsmålet. Prøv å formulere det på en annen måte.' }, 502);
      }
      const text = upstreamBody?.steps
        ?.filter(step => step?.type === 'model_output')
        .flatMap(step => Array.isArray(step.content) ? step.content : [])
        .filter(content => content?.type === 'text')
        .map(content => content.text || '')
        .join('')
        .trim();
      if (!text) return json({ error: 'Gemini ga ikke noe svar.' }, 502);
      const result = parseModelJson(text);
      const allowedIds = new Set(parking.map(place => place.id));
      const signRequest = !!image || /\b(?:parkerings)?skilt(?:et|ene)?\b|underskilt|trafikkskilt/i.test(question);
      const parkingIds = !signRequest && Array.isArray(result.parkingIds)
        ? result.parkingIds.filter(id => typeof id === 'string' && allowedIds.has(id)).slice(0, 3)
        : [];
      const signCode = typeof result.signCode === 'string' && /^\d{3}(?:\.\d+)*$/.test(result.signCode.trim())
        ? result.signCode.trim()
        : '';
      return json({ answer: result.answer.slice(0, 4000), parkingIds, confidence: result.confidence || 'medium', signCode });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Kunne ikke behandle forespørselen.' }, 400);
    }
  }
};

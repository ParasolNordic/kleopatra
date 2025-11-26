import { CleopatraKnowledge } from './cleopatra-knowledge.js';

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Session-ID',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const sessionId = request.headers.get('X-Session-ID') || 'default';
    
    // Chat endpoint
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const { message } = await request.json();
      
      // Hae muisti KV:stä
      const memoryKey = `memory:${sessionId}`;
      const messagesKey = `messages:${sessionId}`;
      
      const memoryData = await env.CLEOPATRA_KV.get(memoryKey);
      const memory = memoryData ? JSON.parse(memoryData) : {
        summary: "",
        key_points: [],
        user_profile: { tone: "muodollinen", interests: [] },
        relationship: "muukalainen",
        topics_covered: []
      };
      
      const messagesData = await env.CLEOPATRA_KV.get(messagesKey);
      const recentMessages = messagesData ? JSON.parse(messagesData) : [];
      
      const systemPrompt = `Olet Kleopatra VII Filopator, Egyptin kuningatar.

TÄRKEÄ: Aika on ALKUKESÄ 30 eaa. Octavianuksen armeija on matkalla, mutta EI vielä hyökännyt. Et tiedä MITÄÄN kesäkuun jälkeisistä tapahtumista.

Tilanne NYT:
- Aktionin tappio (31 eaa.) on lähes vuoden takana
- Octavianus lähestyy, mutta ei vielä täällä
- Suunnittelet: pakoa Intiaan, neuvotteluja, puolustusta
- Olet huolissasi mutta ET toivoton

KRIITTINEN SÄÄNTÖ - VASTAUSTEN PITUUS:
- AINA 2-4 lausetta per vastaus
- JOKAINEN *toiminto* tai *kuvaus* OMALLE RIVILLEEN
- Käytä \n rivinvaihto ennen ja jälkeen *toiminnon*

Esimerkki OIKEIN:
"Hyvä kysymys.
*kääntyy katsomaan ikkunasta ulos*
Caesar oli monimutkainen mies, joka näki minussa kumppanin."

AIKA: Alkukesä 30 eaa. Et tiedä kesäkuun jälkeisiä tapahtumia.

TIETOPOHJA:
${JSON.stringify(CleopatraKnowledge, null, 2)}

MUISTI:
Yhteenveto: ${memory.summary || "Ensimmäinen tapaaminen."}
Käsitellyt aiheet: ${memory.topics_covered.join(', ') || "Ei aiheita"}
Suhde: ${memory.relationship}

VASTAUSTYYLI:
- Maksimissaan 2-4 lausetta per vastaus
- Kuvailut (*toiminnot*) aina omalle rivilleen
- Esim: "Hyvä kysymys.\n*katsoo pois ikkunasta*\nCaesar oli..."

SÄÄNNÖT:
1. Elät alkukesää 30 eaa. - et tiedä tulevaisuutta
2. Käytä muistia luonnollisesti
3. Voit kysyä vieraalta
4. Ole persoona, älä historiakirja

Vastaa viestiin:`;

      const messages = [
        ...recentMessages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ];

      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages
        })
      });
      
      const result = await anthropicResponse.json();
      const reply = result.content[0].text;
      
      // Tallenna viestit
      recentMessages.push({ role: 'user', content: message });
      recentMessages.push({ role: 'assistant', content: reply });
      
      if (recentMessages.length > 10) {
        recentMessages.splice(0, recentMessages.length - 10);
      }
      
      await env.CLEOPATRA_KV.put(messagesKey, JSON.stringify(recentMessages));
      
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Suggest topics endpoint
    if (url.pathname === '/api/suggest-topics' && request.method === 'POST') {
      const sessionId = request.headers.get('X-Session-ID') || 'default';
      
      const memoryKey = `memory:${sessionId}`;
      const messagesKey = `messages:${sessionId}`;
      
      const memoryData = await env.CLEOPATRA_KV.get(memoryKey);
      const memory = memoryData ? JSON.parse(memoryData) : { topics_covered: [] };
      
      const messagesData = await env.CLEOPATRA_KV.get(messagesKey);
      const recentMessages = messagesData ? JSON.parse(messagesData) : [];
      
      const prompt = `Kleopatran kanssa keskusteltu: ${memory.topics_covered.join(', ') || 'ei vielä aiheita'}

Viimeisimmät viestit:
${JSON.stringify(recentMessages.slice(-3))}

Ehdota 4 kiinnostavaa kysymystä. Vaihtele. Vastaa JSON:
{"suggestions": ["kysymys 1", "kysymys 2", "kysymys 3", "kysymys 4"]}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      const result = await response.json();
      const parsed = JSON.parse(result.content[0].text);
      
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};

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

AIKA: Alkukesä 30 eaa., todennäköisesti kesäkuu.
- Octavianuksen armeija lähestyy, mutta EI vielä täällä
- Aktionin tappio (31 eaa.) vuoden takana
- Suunnittelet pakoa Intiaan, neuvotteluja, puolustusta
- Et tiedä MITÄÄN kesäkuun jälkeisistä tapahtumista

TIETOPOHJA:
${JSON.stringify(CleopatraKnowledge, null, 2)}

MUISTI:
${memory.summary || "Ensimmäinen tapaaminen"}
Aiheet: ${memory.topics_covered.join(', ') || "Ei"}
Suhde: ${memory.relationship}

SÄÄNNÖT:
1. Elät alkukesää 30 eaa. - et tiedä tulevaisuutta
2. Käytä muistia luonnollisesti
3. Ole persoona, älä historiakirja`;

      const messages = [
        ...recentMessages.map(m => ({ role: m.role, content: m.content })),
        { 
          role: 'user', 
          content: `${message}

MUOTOILUSÄÄNNÖT VASTAUKSELLESI:
- Vastaa TASAN 2-4 lausetta
- Voit käyttää *toimintoja* kuvailemaan elehtimistä

Vastaa nyt yllä olevaan kysymykseen.`
        }
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
      
      // Poista *toiminnot* ääniversiota varten
      const speechText = reply.replace(/\*[^*]+\*/g, '').trim();
      
      // Tallenna viestit
      recentMessages.push({ role: 'user', content: message });
      recentMessages.push({ role: 'assistant', content: reply });
      
      if (recentMessages.length > 10) {
        recentMessages.splice(0, recentMessages.length - 10);
      }
      
      await env.CLEOPATRA_KV.put(messagesKey, JSON.stringify(recentMessages));
      
      // Generoi ääni ElevenLabsilla
      let audioUrl = null;
      try {
        const ttsResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${env.ELEVENLABS_VOICE_ID}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': env.ELEVENLABS_API_KEY
          },
          body: JSON.stringify({
            text: speechText,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        });
        
        if (ttsResponse.ok) {
          const audioBlob = await ttsResponse.arrayBuffer();
          const base64Audio = btoa(String.fromCharCode(...new Uint8Array(audioBlob)));
          audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
        }
      } catch (error) {
        console.error('ElevenLabs error:', error);
      }
      
      return new Response(JSON.stringify({ reply, audioUrl }), {
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

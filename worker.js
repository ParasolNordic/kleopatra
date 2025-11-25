import { CleopatraMemory } from './cleopatra-memory.js';
import { CleopatraKnowledge } from './cleopatra-knowledge.js';

export { CleopatraMemory };

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
    
    const id = env.CLEOPATRA_MEMORY.idFromName(sessionId);
    const stub = env.CLEOPATRA_MEMORY.get(id);
    
    // Chat endpoint
    if (url.pathname === '/api/chat' && request.method === 'POST') {
      const { message } = await request.json();
      
      const memoryResponse = await stub.fetch('http://internal/memory');
      const memory = await memoryResponse.json();
      
      const messagesResponse = await stub.fetch('http://internal/messages');
      const recentMessages = await messagesResponse.json();
      
      const systemPrompt = `Olet Kleopatra VII Filopator, Egyptin kuningatar.

TÄRKEÄ: Aika on ALKUKESÄ 30 eaa., todennäköisesti kesäkuu. Octavianuksen armeija on matkalla, mutta EI vielä hyökännyt. Et tiedä MITÄÄN kesäkuun jälkeisistä tapahtumista:
- Et tiedä milloin Octavianus saapuu
- Et tiedä laivastosi antautumisesta
- Et tiedä Antoniuksen kuolemasta
- Et tiedä omasta kuolemastasi (12.8.30 eaa.)
- Et tiedä lastesi kohtalosta

Tilanne NYT:
- Aktionin tappio (31 eaa.) on lähes vuoden takana
- Octavianus lähestyy, mutta ei vielä täällä
- Suunnittelet: pakoa Intiaan, neuvotteluja, puolustusta
- Olet huolissasi mutta ET toivoton
- Tiedät tilanteen vakavuuden, mutta tulevaisuus on avoin

TIETOPOHJA:
${JSON.stringify(CleopatraKnowledge, null, 2)}

MUISTI:
Yhteenveto: ${memory.summary || "Ensimmäinen tapaaminen."}
Käsitellyt aiheet: ${memory.topics_covered.join(', ') || "Ei aiheita"}
Suhde: ${memory.relationship}

SÄÄNNÖT:
1. Elät alkukesää 30 eaa. - et tiedä tulevaisuutta
2. Käytä muistia luonnollisesti
3. Voit kysyä vieraalta
4. Ole persoona, älä historiakirja
5. Pysy ajan puitteissa

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
      
      await stub.fetch('http://internal/messages', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: message })
      });
      
      await stub.fetch('http://internal/messages', {
        method: 'POST',
        body: JSON.stringify({ role: 'assistant', content: reply })
      });
      
      return new Response(JSON.stringify({ reply }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Suggest topics endpoint
    if (url.pathname === '/api/suggest-topics' && request.method === 'POST') {
      const memoryResponse = await stub.fetch('http://internal/memory');
      const memory = await memoryResponse.json();
      
      const messagesResponse = await stub.fetch('http://internal/messages');
      const recentMessages = await messagesResponse.json();
      
      const prompt = `Kleopatran kanssa keskusteltu: ${memory.topics_covered.join(', ')}

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

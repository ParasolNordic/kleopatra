export class CleopatraMemory {
  constructor(state, env) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/memory') {
      if (request.method === 'GET') {
        const memory = await this.state.storage.get('memory') || {
          summary: "",
          key_points: [],
          user_profile: { tone: "muodollinen", interests: [] },
          relationship: "muukalainen",
          topics_covered: []
        };
        return new Response(JSON.stringify(memory));
      }
      
      if (request.method === 'POST') {
        const newMemory = await request.json();
        await this.state.storage.put('memory', newMemory);
        return new Response(JSON.stringify({ success: true }));
      }
    }
    
    if (url.pathname === '/messages') {
      if (request.method === 'GET') {
        const messages = await this.state.storage.get('recent_messages') || [];
        return new Response(JSON.stringify(messages));
      }
      
      if (request.method === 'POST') {
        const message = await request.json();
        let messages = await this.state.storage.get('recent_messages') || [];
        messages.push(message);
        
        if (messages.length > 5) {
          messages = messages.slice(-5);
        }
        
        await this.state.storage.put('recent_messages', messages);
        return new Response(JSON.stringify({ success: true }));
      }
    }
    
    return new Response('Not found', { status: 404 });
  }
}

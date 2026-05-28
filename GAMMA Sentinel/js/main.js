document.addEventListener('DOMContentLoaded', () => {

  const chatForm = document.getElementById('chatForm');
  const input = document.getElementById('chatInput');
  const chat = document.getElementById('chatMessages');

  const add = (type, txt) => {
    const el = document.createElement('div');
    el.className = type;
    el.innerText = txt;
    chat.appendChild(el);
  };

  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const q = input.value;
    if (!q) return;

    add('user', q);
    input.value = '';

    add('bot', 'Pensando...');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q })
      });

      const data = await res.json();

      chat.lastChild.remove();
      add('bot', data.reply);

    } catch {
      chat.lastChild.remove();
      add('bot', 'Error consultando backend');
    }
  });

});
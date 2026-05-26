document.addEventListener('DOMContentLoaded', () => {
  const year = new Date().getFullYear();
  const footerParagraphs = document.querySelectorAll('.site-footer p');
  if (footerParagraphs.length > 0) {
    footerParagraphs[0].textContent = `GAMMA Sentinel © ${year}`;
  }

  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach((link) => {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href');
      if (!targetId || targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
});
